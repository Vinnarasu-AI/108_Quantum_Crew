import React, { useState, useEffect } from 'react';
import { rtdb } from '../../firebase.js';
import { ref, onValue, set, serverTimestamp } from 'firebase/database';

/**
 * ESP32LiveData Component
 * Unified monitor for Realtime Database (RTDB) hardware data.
 * Fixed for your specific "readings/esp32_001" structure.
 */
const ESP32LiveData = ({ deviceId = "esp32_001" }) => {
    const [deviceData, setDeviceData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        if (!rtdb) {
            console.error("RTDB not initialized");
            setLoading(false);
            return;
        }

        // 🔗 Using Realtime Database reference as seen in your screenshot
        const esp32Ref = ref(rtdb, `readings/${deviceId}`);

        const unsubscribe = onValue(esp32Ref, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setDeviceData(data);
                setLastUpdate(new Date().toLocaleTimeString());
                console.log("📡 RTDB Data Received:", data);
            } else {
                console.warn(`No data at readings/${deviceId}`);
            }
            setLoading(false);
        }, (err) => {
            console.error("RTDB Error:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [deviceId]);

    const sendControl = async (field, value) => {
        try {
            const controlRef = ref(rtdb, `controls/${deviceId}/${field}`);
            await set(controlRef, value);
            console.log(`✅ Sent ${field}: ${value}`);
        } catch (e) {
            console.error("Control Error:", e);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 font-inter">
            {/* Status Header */}
            <div className="bg-white p-6 rounded-3xl shadow-xl shadow-gray-100 border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                        <span className="text-2xl">📡</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 tracking-tight">ESP32 Live Monitor</h1>
                        <p className="text-xs text-gray-400 font-medium">SOURCE: <span className="text-blue-500 font-bold">REALTIME DATABASE</span></p>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${loading ? 'bg-gray-100 text-gray-400' : (deviceData ? 'bg-green-500 text-white shadow-lg' : 'bg-red-500 text-white shadow-lg')}`}>
                        {loading ? '⏳ SYNCING...' : (deviceData ? '✅ ONLINE' : '❌ NO DATA')}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-wider">Last Packet: {lastUpdate || '--:--:--'}</div>
                </div>
            </div>

            {/* Readings Grid */}
            {deviceData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <MetricCard
                        label="Weight"
                        value={`${deviceData.weight ?? deviceData.weight_grams ?? 0}g`}
                        bg="bg-blue-50" color="text-blue-600" icon="⚖️"
                    />
                    <MetricCard
                        label="Volume"
                        value={`${deviceData.volume ?? deviceData.fluid_ml ?? deviceData.fluidRemainingML ?? 0}ml`}
                        bg="bg-cyan-50" color="text-cyan-600" icon="💧"
                    />
                    <MetricCard
                        label="Drip %"
                        value={`${deviceData.percentage ?? deviceData.fluid_level ?? deviceData.fluidPercentage ?? 0}%`}
                        bg="bg-indigo-50" color="text-indigo-600" icon="📊"
                    />

                    <MetricCard
                        label="Level"
                        value={deviceData.level || ((deviceData.percentage ?? deviceData.fluid_level ?? 100) < 15 ? "LOW" : "NORMAL")}
                        bg={(deviceData.weight ?? deviceData.fluid_level ?? 100) < 15 ? "bg-red-100" : "bg-emerald-50"}
                        color={(deviceData.weight ?? deviceData.fluid_level ?? 100) < 15 ? "text-red-700" : "text-emerald-700"}
                        icon="🌡️"
                    />

                    <MetricCard
                        label="Alarm"
                        value={deviceData.alert_active || deviceData.alarmStatus === "critical" ? '🚨 ACTIVE' : '✅ SOFT'}
                        bg={deviceData.alert_active || deviceData.alarmStatus === "critical" ? "bg-red-50" : "bg-gray-50"}
                        color={deviceData.alert_active || deviceData.alarmStatus === "critical" ? "text-red-600" : "text-gray-500"}
                        icon="🔔"
                    />

                    <MetricCard
                        label="Status"
                        value={deviceData.buzzer_status || deviceData.buzzer === true ? '🔊 ON' : '🔇 MUTE'}
                        bg="bg-amber-50"
                        color="text-amber-700"
                        icon="📢"
                    />
                </div>
            ) : (
                <div className="bg-gray-50 p-20 text-center rounded-3xl border-4 border-dashed border-gray-100">
                    <div className="text-4xl mb-4">🔦</div>
                    <h3 className="text-lg font-bold text-gray-700">Waiting for Data Packets...</h3>
                    <p className="text-sm text-gray-400 mt-2">Checking path: <code className="bg-gray-200 px-1 rounded text-xs">readings/{deviceId}</code></p>
                </div>
            )}

            {/* Diagnostic Console */}
            <div className="bg-gray-900 text-emerald-400 p-6 rounded-3xl font-mono text-xs overflow-hidden border border-gray-800 shadow-2xl">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-800">
                    <span className="font-bold flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        REALTIME TELEMETRY CONSOLE
                    </span>
                    <span className="text-gray-500">v1.1.0</span>
                </div>
                <div className="space-y-1.5 h-32 overflow-y-auto">
                    <div>[SYSTEM] Target: <span className="text-blue-400">{deviceId}</span></div>
                    {deviceData ? (
                        <div className="text-emerald-400">[SUCCESS] Heartbeat detected. Data is flowing.</div>
                    ) : (
                        <div className="text-amber-400">[WAIT] Listening for first packet from hardware...</div>
                    )}
                    <div className="text-gray-500">-------------------------------------------</div>
                    <div className="text-white">1. Verify WiFi on ESP32 Serial Monitor.</div>
                    <div className="text-white">2. Check RTDB Rules at Firebase Console.</div>
                    <div className="text-white">3. Ensure Database URL matches your config.</div>
                    <div className="text-gray-500">[{new Date().toLocaleTimeString()}] Monitoring stream...</div>
                </div>
            </div>
        </div>
    );
};

const MetricCard = ({ label, value, bg, color, icon }) => (
    <div className={`${bg} p-6 rounded-3xl border border-white transition-all shadow-sm`}>
        <div className="flex justify-between items-start mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
            <span className="text-lg">{icon}</span>
        </div>
        <div className={`text-3xl font-black ${color}`}>{value}</div>
    </div>
);

export default ESP32LiveData;
