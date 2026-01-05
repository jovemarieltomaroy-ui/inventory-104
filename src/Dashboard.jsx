import React, { useState, useEffect, useRef } from 'react';
import { FaHome, FaPlus, FaBox, FaPowerOff, FaCheckCircle, FaInfoCircle, FaExclamationTriangle } from "react-icons/fa";
import { IoMdSettings, IoIosNotifications } from "react-icons/io";
import { MdMenu, MdOutlineHistory } from "react-icons/md"; 
import { RiArrowDownSFill } from "react-icons/ri";
import { AlertCircle } from 'lucide-react'; 
import { CgArrowsExchange } from "react-icons/cg";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"; 
import './App.css'; 

// --- RBAC CONSTANTS ---
const ROLES = {
  SUPERADMIN: 1,
  ADMIN: 2,
  USER: 3
};

// --- 1. ACTION WIDGET ---
const ActionWidget = ({ title, subtitle, icon, count }) => {
  return (
    <div className="action-card">
      <div className="card-top">
        <div className="icon-box">{icon}</div>
        {count !== undefined && count !== null && <span className="card-count">{count}</span>}
      </div>
      <div className="card-bottom">
        <h3>{title}</h3>
        <p className="card-subtitle" style={{color: '#efeaeaff'}}>{subtitle}</p>
      </div>
    </div>
  );
};

// --- 2. RECENT ACTIVITY ---
const ActivityItem = ({ title, description, time }) => (
  <div className="activity-item">
    <div className="activity-dot"></div>
    <div className="activity-content">
      <h4 className="act-title">{title}</h4>
      <p className="act-desc">{description}</p>
      <span className="act-time">{new Date(time).toLocaleString()}</span>
    </div>
  </div>
);

// --- 3. LOW STOCK ITEM ---
const LowStockItem = ({ item, count }) => (
  <div className="stock-item">
    <span className="stock-name">{item}</span>
    <span className="stock-badge">{count} left</span>
  </div>
);

// --- Helper Components ---
function NavItem({ icon, text, isOpen }) {
  return (
    <div className="nav-item">
      <div className="nav-icon-container">{icon}</div>
      <span className={`nav-text ${isOpen ? "text-open" : "text-closed"}`}>
        {text}
      </span>
    </div>
  );
}

function useOutsideClick(ref, callback) {
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
}

// --- Main Dashboard Component ---
function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  
  // Profile & Notification UI State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef(null);

  // --- DATA STATE ---
  const [dashboardStats, setDashboardStats] = useState({ totalItems: 0, borrowedItems: 0 });
  const [recentActivities, setRecentActivities] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  
  const [isLoading, setIsLoading] = useState(false); 

  // --- USER STATE ---
  const [currentUser, setCurrentUser] = useState({
    id: null,
    fullName: "", 
    email: "",
    photoUrl: null,
    roleId: null 
  });

  // --- 1. Load User on Mount ---
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const navUser = location.state?.user;

    if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setCurrentUser(parsedUser);
    } else if (navUser) {
        setCurrentUser(navUser);
        localStorage.setItem('user', JSON.stringify(navUser));
    } else {
        console.warn("No user found, redirecting to login.");
        navigate('/'); 
    }
  }, [location.state, navigate]);

  // --- 2. Fetch Dashboard Data from API (With Polling) ---
  useEffect(() => {
    if (!currentUser.id) return; 

    const fetchDashboardData = async () => {
        try {
            // Anti-caching timestamp
            const t = new Date().getTime();

            const [statsRes, activityRes, notifRes] = await Promise.all([
                fetch(`https://inventory-backend-yfyn.onrender.com/api/dashboard/stats?t=${t}`),
                // IMPORTANT: Passing currentUser.id here ensures the backend filters the logs
                fetch(`https://inventory-backend-yfyn.onrender.com/api/dashboard/activity/${currentUser.id}?t=${t}`), 
                fetch(`https://inventory-backend-yfyn.onrender.com/api/notifications/${currentUser.id}?t=${t}`) 
            ]);

            if (statsRes.ok) setDashboardStats(await statsRes.json());
            if (activityRes.ok) setRecentActivities(await activityRes.json());
            if (notifRes.ok) setNotifications(await notifRes.json());

            // Only fetch Low Stock if user is NOT a regular User
            if (currentUser.roleId !== ROLES.USER) {
                const stockRes = await fetch(`https://inventory-backend-yfyn.onrender.com/api/dashboard/low-stock?t=${t}`);
                if (stockRes.ok) setLowStockItems(await stockRes.json());
            }

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        }
    };

    // Initial Fetch
    fetchDashboardData();

    // Poll every 3 seconds
    const intervalId = setInterval(fetchDashboardData, 3000);

    return () => clearInterval(intervalId);
  }, [currentUser.id, currentUser.roleId]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/'); 
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // --- 3. HANDLE MARK ALL READ ---
  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    
    if (!currentUser?.id) return;

    try {
      await fetch(`https://inventory-backend-yfyn.onrender.com/api/notifications/mark-all-read/${currentUser.id}`, { 
        method: 'PUT' 
      });
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  // --- 4. HANDLE SINGLE READ ---
  const handleNotificationClick = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await fetch(`https://inventory-backend-yfyn.onrender.com/api/notifications/read/${id}`, { method: 'PUT' });
    } catch (error) {
       console.error("Failed to mark as read:", error);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const diff = new Date() - date;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'alert': return <AlertCircle size={16} />;
      case 'warning': return <FaExclamationTriangle size={16} />;
      case 'success': return <FaCheckCircle size={16} />;
      default: return <FaInfoCircle size={16} />;
    }
  };

  const getIconColorClass = (type) => {
    switch(type) {
      case 'alert': return 'alert';
      case 'warning': return 'warning';
      case 'success': return 'success';
      default: return 'info';
    }
  };

  const getInitials = (name) => {
    if (!name) return "U";
    const names = name.split(" ");
    let initials = names[0].substring(0, 1).toUpperCase();
    if (names.length > 1) {
      initials += names[names.length - 1].substring(0, 1).toUpperCase();
    }
    return initials;
  };

  const displayUserName = currentUser.fullName || currentUser.name || "User";

  useOutsideClick(notificationRef, () => { if (isNotificationsOpen) setIsNotificationsOpen(false); });
  useOutsideClick(profileRef, () => { if (isProfileOpen) setIsProfileOpen(false); });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setIsSidebarOpen(false); 
      else setIsSidebarOpen(true); 
    };
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showDashboardWidgets = location.pathname === "/dashboard";
  
  return (
    <div className="dashboard-container">
      
      {/* --- HEADER --- */}
      <header className="dashboard-header">
        <div className="header-left">
          <button 
            className="icon-btn" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle Sidebar"
          >
            <MdMenu size={25} />
          </button>
          <div className="brand-title">Inventory System</div>
        </div>

        <div className="header-right">
          
          {/* NOTIFICATIONS */}
          <div className="notification-dropdown-container" ref={notificationRef}>
            <button 
                className="icon-btn"
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                title="Notifications"
            >
                <IoIosNotifications size={25} strokeWidth={2} />
                {unreadCount > 0 && (
                  <div className="notification-badge">{unreadCount}</div>
                )}
            </button>

            {isNotificationsOpen && (
                <div className="notification-dropdown-menu">
                <div className="notification-header">
                    <span>Notifications</span>
                    <span 
                      className="mark-read" 
                      onClick={handleMarkAllRead}
                      style={{ cursor: 'pointer' }}
                    >
                      Mark all as read
                    </span>
                </div>
                <div className="notification-list">
                    {notifications.length > 0 ? (
                      notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          className={`notification-item ${!notif.isRead ? 'unread' : ''}`}
                          onClick={() => handleNotificationClick(notif.id)}
                        >
                            <div className={`notif-icon-box ${getIconColorClass(notif.type)}`}>
                              {getNotificationIcon(notif.type)}
                            </div>
                            <div className="notif-content">
                              <p className="notif-title">{notif.title}</p>
                              <p className="notif-desc">{notif.description}</p>
                              <span className="notif-time">{formatTimeAgo(notif.timestamp)}</span>
                            </div>
                            {!notif.isRead && <div className="unread-dot" style={{width: '8px', height: '8px', borderRadius: '50%', background: '#1976d2'}}></div>}
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                        No new notifications
                      </div>
                    )}
                </div>
                <div 
                    className="notification-footer" 
                    onClick={() => {
                        setIsNotificationsOpen(false); 
                        navigate('notifications');     
                    }}
                    style={{ cursor: 'pointer', color: '#1976d2', fontWeight: '600' }}
                >
                    View All Notifications
                </div>
                </div>
            )}
          </div>

          {/* PROFILE DROPDOWN */}
          <div className="profile-dropdown-container" ref={profileRef}>
              <button className="profile-btn" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <div className="header-avatar" style={{
                    width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', 
                    backgroundColor: currentUser.photoUrl ? 'transparent' : '#1565c0', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: '600', fontSize: '13px',
                    border: '1px solid rgba(255,255,255,0.2)'
                }}>
                  {currentUser.photoUrl ? (
                    <img src={currentUser.photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>{getInitials(displayUserName)}</span>
                  )}
                </div>
                <span className="user-name">{displayUserName}</span>
                <RiArrowDownSFill size={16} />
              </button>
              
              {isProfileOpen && (
                <div className="profile-dropdown-menu">
                    <div className="dropdown-header">
                    <div className="dropdown-avatar-large" style={{
                          width: '60px', height: '60px', borderRadius: '50%', overflow: 'hidden', 
                          backgroundColor: currentUser.photoUrl ? 'transparent' : '#1565c0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontWeight: 'bold', fontSize: '22px',
                          margin: '0 auto 10px auto', border: '2px solid #e0e0e0'
                    }}>
                        {currentUser.photoUrl ? (
                            <img src={currentUser.photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span>{getInitials(displayUserName)}</span>
                        )}
                    </div>
                    <div className="dropdown-user-name">{displayUserName}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{currentUser.email}</div>
                    <div style={{ fontSize: '11px', color: '#1565c0', fontWeight: 'bold', marginTop: '2px', textTransform: 'uppercase' }}>
                        {currentUser.roleId === ROLES.SUPERADMIN ? "Super Admin" : currentUser.roleId === ROLES.ADMIN ? "Admin" : "User"}
                    </div>
                  </div>
                  
                  {/* Dropdown Menu Item - Settings (Strictly Superadmin only) */}
                  {currentUser.roleId === ROLES.SUPERADMIN && (
                    <div className="dropdown-item" onClick={() => navigate('settings')}>
                        <IoMdSettings size={18} />
                        <span>Settings</span>
                    </div>
                  )}

                  <div className="dropdown-item" onClick={handleLogout}>
                    <FaPowerOff size={18} />
                    <span>Logout</span>
                  </div>
                </div>
              )}
            </div>
        </div>
      </header>

      {/* --- BODY ROW --- */}
      <div className="layout-row">
        
        {/* SIDEBAR */}
        <aside className={`sidebar ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <NavItem icon={<FaHome size={20} />} text="Home" isOpen={isSidebarOpen} />
          </Link>

          {/* RBAC: Only Admin/Superadmin see Quick Add */}
          {currentUser.roleId !== ROLES.USER && (
            <Link to="add-item" state={{ background: location }} style={{ textDecoration: 'none' }}>
                <NavItem icon={<FaPlus size={20} />} text="Quick Add" isOpen={isSidebarOpen} />
            </Link>
          )}

          <Link to="inventory" style={{ textDecoration: 'none' }}>
            <NavItem icon={<FaBox size={20} />} text="Inventory" isOpen={isSidebarOpen} />
          </Link>
          <Link to="borrowing" style={{ textDecoration: 'none' }}>
            <NavItem icon={<CgArrowsExchange size={20} />} text="Borrowing" isOpen={isSidebarOpen} />
          </Link>
          <Link to="history" style={{ textDecoration: 'none' }}>
            <NavItem icon={<MdOutlineHistory size={20} />} text="History" isOpen={isSidebarOpen} />
          </Link>

          {/* RBAC: Only SUPERADMIN sees Settings */}
          {currentUser.roleId === ROLES.SUPERADMIN && (
            <Link to="settings" style={{ textDecoration: 'none' }}>
                <NavItem icon={<IoMdSettings size={20} />} text="Settings" isOpen={isSidebarOpen} />
            </Link>
          )}

          <div style={{ flex: 1 }}></div> 
          <div onClick={handleLogout} style={{ width: '100%', cursor: 'pointer' }}>
            <NavItem icon={<FaPowerOff size={20} />} text="Logout" isOpen={isSidebarOpen} />
          </div>
          <div style={{ height: '20px' }}></div> 
        </aside>
              
        {/* MAIN CONTENT AREA */}
        <main className="content-card">
              <div className="breadcrumb">
                <span>Dashboard</span>
                {!showDashboardWidgets && <span> / {location.pathname.replace('/dashboard/', '').replace('/dashboard', '')}</span>}
            </div>
          {showDashboardWidgets ? (
              <div className='header-titles'>
                <h1>Overview</h1>
                <p>
                  Welcome back, {displayUserName}! 
                </p>
                
                {isLoading ? (
                    <div style={{padding: '40px', textAlign: 'center'}}>Loading Dashboard Data...</div>
                ) : (
                    <>
                        {/* 1. DASHBOARD WIDGETS (Visible to All) */}
                        <div className="dashboard-section-title">Quick Actions</div>
                        <div className="actions-grid">
                            <Link to="inventory" style={{ textDecoration: 'none' }}>
                                <ActionWidget 
                                    title="Inventory" 
                                    subtitle="View & Manage" 
                                    icon={<FaBox size={24} />} 
                                    count={dashboardStats.totalItems} 
                                />
                            </Link> 
                            <Link to="borrowing" style={{ textDecoration: 'none' }}>
                                <ActionWidget 
                                    title="Borrowing" 
                                    subtitle="View Transactions" 
                                    icon={<CgArrowsExchange size={24} />} 
                                    count={dashboardStats.borrowedItems} 
                                />
                            </Link>
                            <Link to="history" style={{ textDecoration: 'none' }}>
                                <ActionWidget title="History" subtitle="Transaction Logs" icon={<MdOutlineHistory size={24} />} />  
                            </Link>
                        </div>

                        {/* 2. RECENT ACTIVITY (Visible to All - Filtered by Backend) */}
                        <div className="recent-activity-card">
                            <div className="dashboard-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MdOutlineHistory size={22} color="#003A73" />
                                Recent Activity
                            </div>
                            <div className="activity-list-container">
                                {recentActivities.length > 0 ? (
                                    recentActivities.map((item, index) => (
                                        <ActivityItem 
                                            key={index} 
                                            title={item.title} 
                                            description={item.description} 
                                            time={item.timestamp} 
                                        />
                                    ))
                                ) : (
                                    <div style={{padding:'20px', color: '#666'}}>No recent activity found.</div>
                                )}
                            </div>
                        </div>

                        {/* 3. LOW STOCK (RBAC: Hidden for Users) */}
                        {currentUser.roleId !== ROLES.USER && (
                            <div className="low-stock-card">
                                <div className="dashboard-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertCircle size={22} color="#E65100" /> 
                                    Low Stock of Consumables
                                </div>
                                <div className="stock-list-container">
                                    {lowStockItems.length > 0 ? (
                                        lowStockItems.map((item, index) => (
                                            <LowStockItem 
                                                key={index} 
                                                item={item.name} 
                                                count={item.quantity} 
                                            />
                                        ))
                                    ) : (
                                        <div style={{padding:'20px', color: '#666'}}>No items with low stock.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
                <div style={{ height: '50px' }}></div>
              </div>
            ) : (
                <Outlet />
            )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;