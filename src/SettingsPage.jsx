import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaUserPlus, FaTrash, FaShieldAlt, FaUser, FaCheck, 
  FaRuler, FaUsersCog, FaSearch, FaExclamationTriangle, FaSave, FaDatabase
} from "react-icons/fa";
import { IoMdClose } from "react-icons/io";

const ROLES = {
  SUPERADMIN: 1,
  ADMIN: 2,
  USER: 3
};

const roleIdToName = (id) => {
  if (id === ROLES.SUPERADMIN) return "Superadmin";
  if (id === ROLES.ADMIN) return "Admin";
  return "User";
};

// --- INLINE STYLES ---
const modalStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  content: {
    backgroundColor: '#fff', width: '90%', maxWidth: '400px', borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  header: {
    backgroundColor: '#f8f9fa', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee',
  },
  headerTitle: { margin: 0, fontSize: '1.2rem', color: '#333' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  body: { padding: '20px' },
  formGroup: { marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' },
  label: { fontSize: '0.9rem', fontWeight: '600', color: '#555' },
  input: { padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box' },
  footer: { padding: '15px 20px', backgroundColor: '#f8f9fa', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
  btnCancel: { backgroundColor: '#fff', border: '1px solid #ddd', color: '#555', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' },
  btnSubmit: { backgroundColor: '#00497a', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' },
  btnDelete: { backgroundColor: '#d32f2f', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }
};

const SettingsPage = () => {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem("user")) || {};

  const [activeTab, setActiveTab] = useState("users");
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]); 
  const [committees, setCommittees] = useState([]);
  
  const [inventoryItems, setInventoryItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'User', tempPassword: '' });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const [toast, setToast] = useState({ message: "", type: "" });

  const API_URL = "https://inventory-backend-yfyn.onrender.com/api";

  useEffect(() => {
    if (!currentUser.id || currentUser.roleId !== ROLES.SUPERADMIN) {
      navigate("/dashboard");
      return;
    }
    fetchSettingsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, currentUser.roleId, currentUser.id]);

  useEffect(() => {
    if (toast.message) {
      const t = setTimeout(() => setToast({ message: "", type: "" }), 3000);
      return () => clearTimeout(t);
    }
  }, [toast.message]);

  const fetchSettingsData = async () => {
    setLoading(true);
    try {
      const usersRes = await fetch(`${API_URL}/users`);
      const usersData = await usersRes.json();
      
      const normalizedUsers = usersData.map(u => ({
        id: u.id ?? u.userID ?? u.userId,
        name: u.name ?? u.fullName ?? u.full_name,
        email: u.email,
        roleID: u.roleID ?? u.roleId ?? u.role_id,
        status: u.status,
        lastLogin: u.lastLogin ?? u.last_login,
      }));
      setUsers(normalizedUsers);

      try {
        const refsRes = await fetch(`${API_URL}/inventory/references`);
        if (refsRes.ok) {
            const refsData = await refsRes.json();
            // Store Objects {id, name}
            setUnits((refsData.units || []).map(u => ({ id: u.id, name: u.label || u.name })));
            setCommittees((refsData.committees || []).map(c => ({ id: c.id, name: c.label || c.name })));
        }
      } catch (err) { setUnits([]); setCommittees([]); }

      try {
        const itemsRes = await fetch(`${API_URL}/inventory/items`);
        if (itemsRes.ok) {
            const itemsData = await itemsRes.json();
            setInventoryItems(itemsData.map(item => ({
            id: item.id ?? item.itemID ?? item.itemId,
            name: item.name,
            category: item.category,
            threshold: item.threshold ?? 0
            })));
        }
      } catch (err) { setInventoryItems([]); }
      
    } catch (err) {
      console.error("Error fetching settings:", err);
      setToast({ message: "Failed to load settings data.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const adminUsers = users.filter(u => u.roleID === ROLES.ADMIN || u.roleID === ROLES.SUPERADMIN);
  const regularUsers = users.filter(u => u.roleID === ROLES.USER);

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (currentUser.roleId !== ROLES.SUPERADMIN) {
        setToast({ message: "Access Denied.", type: 'error' });
        return;
    }

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            password: newUser.tempPassword || 'password123',
            creatorRoleID: currentUser.roleId 
        })
      });
      const result = await response.json();
      if (result.success) {
          setToast({ message: "User added successfully.", type: 'success' });
          setShowModal(false);
          setNewUser({ name: '', email: '', role: 'User', tempPassword: '' });
          fetchSettingsData(); 
      } else {
          setToast({ message: result.message || "Error adding user.", type: 'error' });
      }
    } catch (error) {
      setToast({ message: "Connection error adding user.", type: 'error' });
    }
  };

  const initiateDeleteUser = (targetUser) => {
    if (targetUser.id === currentUser.id) {
        setToast({ message: "You cannot delete your own account.", type: 'warning' });
        return;
    }
    setUserToDelete(targetUser.id);
    setShowDeleteModal(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      const response = await fetch(`${API_URL}/users/${userToDelete}`, {
        method: 'DELETE',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestorRoleID: currentUser.roleId })
      });
      const result = await response.json();
      if (result.success) {
        setToast({ message: "User deleted successfully.", type: "success" });
        setUsers(prev => prev.filter(u => u.id !== userToDelete));
      } else {
        setToast({ message: result.message || "Failed to delete user.", type: 'error' });
      }
    } catch (error) {
      setToast({ message: "Connection error.", type: 'error' });
    } finally {
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  };

  const handleUpdateItemThreshold = async (id, newVal) => {
    const val = parseInt(newVal) || 0;
    setInventoryItems(inventoryItems.map(item => item.id === id ? { ...item, threshold: val } : item));
    try {
        await fetch(`${API_URL}/inventory/items/${id}/threshold`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threshold: val, roleID: currentUser.roleId })
        });
        setToast({ message: "Threshold saved.", type: "success" });
    } catch (error) {
        setToast({ message: "Failed to save threshold.", type: 'error' });
    }
  };

  const handleAddDefinition = async (endpoint, list, setList, name) => {
    if (!name || list.some(i => i.name === name)) return;
    try {
      const res = await fetch(`${API_URL}/settings/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, roleID: currentUser.roleId })
      });
      const data = await res.json();
      
      if(data.success) {
          setToast({ message: `${name} added.`, type: 'success' });
          fetchSettingsData();
      } else {
        setToast({ message: data.message || "Error adding item", type: 'error' });
      }
    } catch (error) { 
      setToast({ message: "Error adding item.", type: 'error' }); 
    }
  };

  // --- FIX: Updated Delete Function to send JSON Body ---
  const handleDeleteDefinition = async (endpoint, list, setList, id, name) => {
    try {
      // 1. Remove query params from URL
      const url = `${API_URL}/settings/${endpoint}/${id}`;
      
      const res = await fetch(url, { 
          method: 'DELETE',
          // 2. Add Content-Type Header
          headers: { 'Content-Type': 'application/json' },
          // 3. Send roleID in the Body
          body: JSON.stringify({ roleID: currentUser.roleId })
      });
      
      if (!res.ok) {
         throw new Error("Server returned " + res.status);
      }

      const data = await res.json();
      if (data.success) {
        setList(prev => prev.filter(i => i.id !== id));
        setToast({ message: `${name} removed.`, type: 'success' });
      } else {
        setToast({ message: data.message || "Error removing item.", type: 'error' }); 
      }
    } catch (error) { 
      console.error(error);
      setToast({ message: "Connection error or ID missing.", type: 'error' }); 
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
  };

  const ConfigCard = ({ title, icon, data, setData, placeholder, endpoint }) => {
    const [inputValue, setInputValue] = useState("");
    return (
      <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="card-header" style={{ marginBottom: '15px' }}>{icon}<h3>{title}</h3></div>
        <div className="no-scrollbar" style={{ flex: 1, maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px', marginBottom: '15px' }}>
          {data.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f9f9f9', fontSize: '14px' }}>
              <span>{item.name}</span>
              <button 
                onClick={() => handleDeleteDefinition(endpoint, data, setData, item.id, item.name)} 
                style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer' }}
                title="Delete"
              >
                <FaTrash size={12}/>
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="text" placeholder={placeholder} value={inputValue} onChange={(e) => setInputValue(e.target.value)} style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}/>
          <button onClick={() => { handleAddDefinition(endpoint, data, setData, inputValue); setInputValue(""); }} disabled={!inputValue.trim()} style={{ backgroundColor: '#00497aff', color: 'white', border: 'none', borderRadius: '4px', width: '36px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><FaUserPlus /></button>
        </div>
      </div>
    );
  };

  const UserTable = ({ data, title, icon }) => (
    <div className="settings-section">
      <div className="section-header"><div className="header-icon-box">{icon}</div><h3>{title}</h3></div>
      <div className="table-responsive">
        <table className="settings-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>
            {data.map(user => (
              <tr key={user.id}>
                <td data-label="Name"><div className="user-cell"><div className="user-avatar-small">{(user.name || 'U').charAt(0)}</div>{user.name}</div></td>
                <td  className="email-cell" data-label="Email">{user.email}</td>
                <td data-label="Role"><span style={{ fontSize: '12px', fontWeight: 'bold', color: user.roleID === ROLES.SUPERADMIN ? '#d32f2f' : '#1976d2' }}>{roleIdToName(user.roleID)}</span></td>
                <td data-label="Status"><span className={`status-pill ${user.status ? user.status.toLowerCase() : 'inactive'}`}>{user.status || 'Inactive'}</span></td>
                <td data-label="Last Login" style={{ color: '#666', fontSize: '13px' }}>{formatDate(user.lastLogin)}</td>
                <td data-label="Actions">
                  <button 
                    onClick={() => initiateDeleteUser(user)}
                    style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', fontSize: '16px' }}
                    title="Delete User"
                  >
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan="6" className="empty-msg">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const filteredItems = inventoryItems.filter(item => (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase())));

  return (
    <div className="settings-container">
      <div className="settings-header"><h1>Settings</h1><p>Manage system access and configuration.</p></div>
      
      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>User Management</button>
        <button className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General & System</button>
      </div>

      {activeTab === 'users' && (
        <div className="tab-content fade-in">
          <div className="actions-bar"><button className="add-user-btn" onClick={() => setShowModal(true)}><FaUserPlus /> Add New User</button></div>
          {loading ? <p>Loading users...</p> : (<><UserTable data={adminUsers} title="Administrators" icon={<FaShieldAlt color="#1976d2" />} /><UserTable data={regularUsers} title="Standard Users" icon={<FaUser color="#666" />} /></>)}
        </div>
      )}

      {activeTab === 'general' && (
        <div className="tab-content fade-in">
          <h3 style={{ margin: '25px 0 15px 0', color: '#444', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>System Definitions</h3>
          <div className="centered-cards-container">
            <ConfigCard title="Units of Measure" icon={<FaRuler className="card-icon" color="#005de9ff"/>} data={units} setData={setUnits} placeholder="New Unit..." endpoint="units" />
            <ConfigCard title="Committees" icon={<FaUsersCog className="card-icon" color="#003b95ff"/>} data={committees} setData={setCommittees} placeholder="New Committee..." endpoint="committees" />
            <ConfigCard title="Item Types" icon={<FaDatabase className="card-icon" color="#008f7aff"/>} data={[]} setData={() => {}} placeholder="Types managed in inventory" endpoint="types" />
          </div>

          <div className="settings-card">
            <div className="card-header"><FaDatabase className="card-icon" /><h3>Item Threshold Rules</h3></div>
            <div className="search-box-wrapper"><FaSearch className="search-icon"/><input type="text" placeholder="Search item..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
            <div className="rules-container" style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', padding: '10px 15px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee', fontWeight: '600', fontSize: '13px', color: '#555', position: 'sticky', top: 0 }}>
                <div>Item Name</div><div>Category</div><div style={{ textAlign: 'center' }}>Low Stock Alert</div>
              </div>
              {filteredItems.map((item) => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', padding: '12px 15px', borderBottom: '1px solid #eee', alignItems: 'center' }}>
                  <div style={{ color: '#333', fontWeight: '500' }}>{item.name}</div>
                  <div style={{ color: '#666', fontSize: '13px' }}><span style={{background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: '4px', fontSize: '11px'}}>{item.category || '-'}</span></div>
                  <div style={{ textAlign: 'center' }}><input type="number" value={item.threshold} onChange={(e) => handleUpdateItemThreshold(item.id, e.target.value)} style={{ width: '60px', padding: '6px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', fontWeight: 'bold', color: '#d32f2f' }} /></div>
                </div>
              ))}
            </div>
            <button className="save-btn" onClick={() => setToast({message:'Settings Saved', type:'success'})} style={{ marginTop: '20px' }}><FaSave /> Settings Saved</button>
          </div>
        </div>
      )}

      {/* --- ADD USER MODAL --- */}
      {showModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.content}>
            <div style={modalStyles.header}>
              <h3 style={modalStyles.headerTitle}>Add New User</h3>
              <button style={modalStyles.closeBtn} onClick={() => setShowModal(false)}><IoMdClose /></button>
            </div>
            <form onSubmit={handleAddUser}>
              <div style={modalStyles.body}>
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Full Name</label>
                  <input required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} style={modalStyles.input} />
                </div>
                
                <div style={modalStyles.formGroup}>
                    <label style={modalStyles.label}>Email</label>
                    <input required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="fullname@inventory.system" style={modalStyles.input} />
                </div>

                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Temp Password</label>
                  <input required type="password" value={newUser.tempPassword} onChange={e => setNewUser({...newUser, tempPassword: e.target.value})} style={modalStyles.input} />
                </div>
                
                <div style={modalStyles.formGroup}>
                  <label style={modalStyles.label}>Role</label>
                  <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={modalStyles.input}>
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>
              <div style={modalStyles.footer}>
                <button type="button" style={modalStyles.btnCancel} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" style={modalStyles.btnSubmit}>Add User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DELETE MODAL --- */}
      {showDeleteModal && (
        <div style={modalStyles.overlay}>
          <div style={modalStyles.content}>
            <div style={modalStyles.header}><h3>Warning</h3></div>
            <div style={modalStyles.body}><p>Are you sure you want to delete this user?</p></div>
            <div style={modalStyles.footer}>
              <button style={modalStyles.btnCancel} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button style={modalStyles.btnDelete} onClick={confirmDeleteUser}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast.message && <div style={{ position: 'fixed', bottom: '24px', right: '24px', backgroundColor: '#333', color: 'white', padding: '12px 24px', borderRadius: '8px', zIndex: 1100, display: 'flex', alignItems: 'center', gap: '12px' }}>{toast.type === 'error' ? <FaExclamationTriangle style={{color:'#f44336'}}/> : <FaCheck style={{color:'#4caf50'}}/>}{toast.message}</div>}
    </div>
  );
};

export default SettingsPage;