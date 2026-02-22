import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../firebase.js';
import {
    doc,
    onSnapshot,
    setDoc,
    collection,
    addDoc,
    serverTimestamp
} from 'firebase/firestore';

/**
 * IVMonitor Component
 * Integrates real-time ESP32 weight data from Firebase Firestore.
 */
const IVMonitor = ({ deviceId = "esp32_001" }) => {
    // 🔍 Connection Test Log
    useEffect(() => {
        console.log('🔍 Testing Firebase connection...');
        const testRef = doc(db, 'test-connection', 'status');
        setDoc(testRef, {
            timestamp: new Date().toISOString(),
            message: 'Test from React IV Monitor'
        }).then(() => console.log('✅ Firebase write successful!'))
            .catch(err => console.error('❌ Firebase write failed:', err));
    }, []);

    // State
    const [data, setData] = useState({
        weight: 0,
        volume: 0,
        percentage: 0,
        level: 'UNKNOWN',
        alert_active: false,
        buzzer_status: false,
        led_status: false,
        timestamp: null,
        device_status: 'offline'
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Thresholds & Mapping
    const THRESHOLDS = {
        W_FULL: 622,
        W_HALF: 388,
        W_QTR: 230,
        W_LOW: 115,
    };

    const volumeMap = [
        { w: 622, v: 500 },
        { w: 388, v: 250 },
        { w: 230, v: 125 },
        { w: 115, v: 50 },
        { w: 0, v: 0 }
    ];

    // Helper: Calculate Volume & Percentage
    const calculateMetrics = (weight) => {
        let volume = 0;
        // Linear interpolation for volume based on weight
        if (weight >= volumeMap[0].w) {
            volume = volumeMap[0].v;
        } else if (weight <= 0) {
            volume = 0;
        } else {
            for (let i = 0; i < volumeMap.length - 1; i++) {
                const top = volumeMap[i];
                const bot = volumeMap[i + 1];
                if (weight <= top.w && weight >= bot.w) {
                    const ratio = (weight - bot.w) / (top.w - bot.w);
                    volume = bot.v + ratio * (top.v - bot.v);
                    break;
                }
            }
        }
        const percentage = Math.min(100, Math.max(0, (volume / 500) * 100));
        return { volume: Math.round(volume), percentage: Math.round(percentage) };
    };

    // Helper: Determine Level
    const getLevel = (weight) => {
        if (weight >= THRESHOLDS.W_FULL) return 'FULL';
        if (weight >= THRESHOLDS.W_HALF) return 'HALF';
        if (weight >= THRESHOLDS.W_QTR) return 'QUARTER';
        return 'LOW';
    };

    // Helper: Colors
    const getLevelColor = (level) => {
        switch (level) {
            case 'FULL': return '#4CAF50'; // success
            case 'HALF': return '#2196F3'; // primary
            case 'QUARTER': return '#FF9800'; // warning
            case 'LOW': return '#F44336'; // danger
            default: return '#9E9E9E';
        }
    };

    const getProgressColor = (percent) => {
        if (percent > 50) return 'bg-green-500';
        if (percent > 25) return 'bg-blue-500';
        if (percent > 10) return 'bg-orange-500';
        return 'bg-red-500';
    };

    // Firebase Real-time Listener
    useEffect(() => {
        const docRef = doc(db, 'readings', deviceId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const remoteData = docSnap.data();
                const { volume, percentage } = calculateMetrics(remoteData.weight || 0);
                const level = getLevel(remoteData.weight || 0);

                // Check for auto-alert
                const isLow = remoteData.weight < THRESHOLDS.W_LOW;

                setData({
                    ...remoteData,
                    volume,
                    percentage,
                    level,
                    alert_active: isLow || remoteData.alert_active,
                    device_status: 'online',
                    timestamp: remoteData.timestamp && typeof remoteData.timestamp.toDate === 'function'
                        ? remoteData.timestamp.toDate()
                        : new Date()
                });
                console.log('📡 Firebase data received:', remoteData);
                setLoading(false);
            } else {
                setError(`Device ${deviceId} not found in Firestore.`);
                setLoading(false);
            }
        }, (err) => {
            console.error("Firebase error:", err);
            setData(prev => ({ ...prev, device_status: 'offline' }));
            setError("Failed to connect to Firebase.");
        });

        return () => unsubscribe();
    }, [deviceId]);

    // Actions
    const controlBuzzer = async (status) => {
        try {
            await setDoc(doc(db, 'controls', deviceId), {
                buzzer_control: status,
                issued_at: serverTimestamp(),
                issued_by: 'Nurse_Admin'
            }, { merge: true });
        } catch (err) {
            console.error("Control Error:", err);
            alert("Failed to update buzzer control");
        }
    };

    const controlLED = async (status) => {
        try {
            await setDoc(doc(db, 'controls', deviceId), {
                led_control: status,
                issued_at: serverTimestamp(),
                issued_by: 'Nurse_Admin'
            }, { merge: true });
        } catch (err) {
            console.error("Control Error:", err);
            alert("Failed to update LED control");
        }
    };

    const acknowledgeAlert = async () => {
        try {
            // 1. Update controls
            await setDoc(doc(db, 'controls', deviceId), {
                acknowledge_alert: true,
                issued_at: serverTimestamp(),
                issued_by: 'Nurse_Admin'
            }, { merge: true });

            // 2. Log to history
            await addDoc(collection(db, 'alert_history'), {
                device_id: deviceId,
                alert_type: 'LOW_LEVEL',
                percentage: data.percentage,
                action_taken: 'Acknowledged',
                action_by: 'Nurse_Admin',
                timestamp: serverTimestamp()
            });

            // 3. Clear local alert status (it might be overwritten by next snapshot if ESP32 hasn't cleared it)
            setData(prev => ({ ...prev, alert_active: false }));
        } catch (err) {
            console.error("Ack Error:", err);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden font-inter transition-all duration-300 hover:shadow-2xl border border-gray-100">
            {/* Header */}
            <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-b border-gray-100">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${data.device_status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-400'}`}></span>
                        IV Saline Monitor
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">Device ID: <span className="font-mono uppercase">{deviceId}</span></p>
                </div>
                <div className="text-right">
                    <div className="text-sm font-medium text-gray-600">Bed #03</div>
                    <div className="text-[10px] text-gray-400">{data.timestamp ? data.timestamp.toLocaleTimeString() : '--:--:--'}</div>
                </div>
            </div>

            {/* Alert Banner */}
            {data.alert_active && (
                <div className="bg-red-500 px-6 py-3 flex justify-between items-center animate-pulse">
                    <div className="flex items-center gap-2 text-white">
                        <span className="text-lg">⚠️</span>
                        <span className="font-bold tracking-wide">CRITICAL LOW LEVEL ALERT</span>
                    </div>
                    <button
                        onClick={acknowledgeAlert}
                        className="bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-md transition-all font-semibold uppercase border border-white/20"
                    >
                        Acknowledge
                    </button>
                </div>
            )}

            {/* Main Content */}
            <div className="p-6">
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="space-y-1">
                        <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">Volume</span>
                        <div className="text-3xl font-bold text-gray-800">
                            {data.volume}<span className="text-lg font-normal text-gray-400 ml-1">ml</span>
                        </div>
                    </div>
                    <div className="space-y-1 text-right">
                        <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">Status</span>
                        <div className={`text-xl font-bold`} style={{ color: getLevelColor(data.level) }}>
                            {data.level}
                        </div>
                    </div>
                </div>

                {/* Progress Section */}
                <div className="mb-8">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-semibold text-gray-600">Remaining</span>
                        <span className="text-2xl font-black text-gray-800">{data.percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner">
                        <div
                            className={`h-full transition-all duration-1000 ease-out ${getProgressColor(data.percentage)}`}
                            style={{ width: `${data.percentage}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-gray-400 font-medium">
                        <span>EMPTY</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>FULL</span>
                    </div>
                </div>

                {/* Control Panel */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Hardware Controls</h3>
                    <div className="flex gap-4">
                        <button
                            onClick={() => controlBuzzer(!data.buzzer_status)}
                            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-semibold ${data.buzzer_status
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                                }`}
                        >
                            <span>{data.buzzer_status ? '🔊' : '🔇'}</span>
                            Buzzer {data.buzzer_status ? 'ON' : 'OFF'}
                        </button>
                        <button
                            onClick={() => controlLED(!data.led_status)}
                            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-semibold ${data.led_status
                                ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-100'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-yellow-300'
                                }`}
                        >
                            <span>{data.led_status ? '💡' : '🌑'}</span>
                            LED {data.led_status ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Timestamp */}
            <div className="bg-gray-50 px-6 py-3 text-[10px] text-center text-gray-400 border-t border-gray-50">
                LAST SYNC: {data.timestamp ? data.timestamp.toLocaleString() : 'N/A'} • SMART-IV CLOUD SYSTEM
            </div>

            {error && (
                <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-6 text-center backdrop-blur-sm">
                    <div className="text-4xl mb-4">🔌</div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">Connection Lost</h3>
                    <p className="text-sm text-gray-500 mb-4">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
                    >
                        Retry Connection
                    </button>
                </div>
            )}
        </div>
    );
};

export default IVMonitor;
