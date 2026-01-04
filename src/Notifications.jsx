import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaBell, FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaCheckDouble } from "react-icons/fa";
import { AlertCircle } from 'lucide-react'; 

const Notifications = () => {
    const currentUser = JSON.parse(localStorage.getItem('user'));
    const [allNotifications, setAllNotifications] = useState([]);

    // --- HELPER: Icon Logic ---
    const getNotificationIcon = (type) => {
        switch(type) {
          case 'alert': return <AlertCircle size={20} />;
          case 'warning': return <FaExclamationTriangle size={20} />;
          case 'success': return <FaCheckCircle size={20} />;
          default: return <FaInfoCircle size={20} />;
        }
    };

    const fetchAll = async () => {
        if (!currentUser?.id) return;
        try {
            // ?t=timestamp to force the browser to get fresh data, not cached data
            const res = await fetch(`https://inventory-104.onrender.com/api/notifications/all/${currentUser.id}?t=${new Date().getTime()}`, {
                headers: { 
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            const data = await res.json();
            setAllNotifications(data);
        } catch (err) {
            console.error("Fetch error:", err);
        }
    };

    // --- ACTION: Mark all as read ---
    const handleMarkAllRead = async () => {
        if (!currentUser?.id) return;
        try {
           
            const updated = allNotifications.map(n => ({ ...n, isRead: true }));
            setAllNotifications(updated);

            // Send command to Database
            await fetch(`https://inventory-104.onrender.com/api/notifications/mark-all-read/${currentUser.id}`, {
                method: 'PUT'
            });
            
            // Re-fetch immediately to ensure sync
            fetchAll(); 
        } catch (error) {
            console.error("Failed to mark read", error);
        }
    };

    useEffect(() => {
        // 1. Initial Load
        fetchAll();

        // 2. Poll every 3 seconds to keep sync
        const intervalId = setInterval(fetchAll, 3000);

        // 3. Cleanup on unmount
        return () => clearInterval(intervalId);
    }, [currentUser?.id]);

    return (
        <div className="content-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>All Notifications</h1>
                
                {/* Mark All Read Button */}
                <button 
                    onClick={handleMarkAllRead}
                    style={{
                        padding: '8px 16px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: 'bold'
                    }}
                >
                    <FaCheckDouble /> Mark all as read
                </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {allNotifications.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No notifications found.</div>
                ) : (
                    allNotifications.map((notif) => (
                        <div key={notif.id} style={{ 
                            padding: '15px', 
                            border: '1px solid #eee', 
                            borderRadius: '8px',
                            display: 'flex', 
                            gap: '15px', 
                            alignItems: 'center',
                            // Visual Logic: Blue tint if unread, White if read
                            background: notif.isRead ? 'white' : '#e6f2ff', 
                            borderLeft: notif.isRead ? '1px solid #eee' : '4px solid #007bff',
                            transition: 'background 0.3s ease'
                        }}>
                            <div className={`notif-icon-box ${notif.type}`} style={{ color: notif.isRead ? '#888' : '#007bff' }}>
                                {getNotificationIcon(notif.type)}
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: notif.isRead ? 'normal' : 'bold' }}>
                                    {notif.title}
                                </h4>
                                <small style={{ color: '#666' }}>{new Date(notif.timestamp).toLocaleString()}</small>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Notifications;