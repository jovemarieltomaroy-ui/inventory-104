import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TbCube3dSphere } from "react-icons/tb";
import { FaLock, FaCheckCircle } from "react-icons/fa";

const LoginPage = () => {
  const navigate = useNavigate();
  
  // --- STATE MANAGEMENT ---
  const [step, setStep] = useState('login'); 
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [newPasswordData, setNewPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [tempUserId, setTempUserId] = useState(null); // Stores UserID during password change flow
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- HANDLERS ---

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNewPassChange = (e) => {
    setNewPasswordData({ ...newPasswordData, [e.target.name]: e.target.value });
  };

  // 1. INITIAL LOGIN ATTEMPT
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        // CASE A: FIRST TIME LOGIN (Status Inactive)
        if (data.requirePasswordChange) {
            setTempUserId(data.userID);
            setSuccessMsg(data.message);
            setStep('changePassword'); // Switch UI to Password Change Mode
        } 
        // CASE B: NORMAL LOGIN
        else {
            finalizeLogin(data.user);
        }
      } else {
        setError(data.message || 'Invalid credentials.');
      }
    } catch (err) {
      console.error("Login Error:", err);
      setError('Cannot connect to server.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. FORCE PASSWORD CHANGE SUBMISSION
  const handleFirstTimeLogin = async (e) => {
      e.preventDefault();
      setError('');

      if (newPasswordData.newPassword !== newPasswordData.confirmPassword) {
          setError("Passwords do not match.");
          return;
      }
      if (newPasswordData.newPassword.length < 6) {
          setError("Password must be at least 6 characters.");
          return;
      }

      setIsLoading(true);

      try {
          const response = await fetch('https://inventory-backend-yfyn.onrender.com/api/auth/first-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  userID: tempUserId,
                  newPassword: newPasswordData.newPassword
              }),
          });

          const data = await response.json();

          if (data.success) {
              finalizeLogin(data.user);
          } else {
              setError(data.message || "Failed to update password.");
          }
      } catch (err) {
          setError("Connection error during activation.");
      } finally {
          setIsLoading(false);
      }
  };

  // 3. FINALIZE & REDIRECT
  const finalizeLogin = (user) => {
      localStorage.setItem('user', JSON.stringify(user));
      console.log("Login Successful:", user);
      navigate('/dashboard', { state: { user } });
  };

  return (
    <div className="login-page">
        <h1 className="system-title">INVENTORY SYSTEM</h1>

        <div className="login-card">
            <div className="icon-container">
                <TbCube3dSphere className="box-icon" style={{color: '#001e39ff'}}/>
                <p className="icon-text">INVENTORY & BORROWING MANAGER</p>
            </div>

            {/* ERROR / SUCCESS FEEDBACK */}
            {error && <div className="error-message">{error}</div>}
            {successMsg && <div className="success-message" style={{color: 'green', fontSize:'13px', marginBottom:'10px', textAlign:'center'}}>{successMsg}</div>}

            {/* --- VIEW 1: STANDARD LOGIN --- */}
            {step === 'login' && (
                <form onSubmit={handleLogin} className="login-form">
                    <input
                        type="email"
                        name="email"
                        placeholder="Enter Email" 
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="minimal-input"
                    />
                    <input
                        type="password"
                        name="password"
                        placeholder="Enter Password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        className="minimal-input"
                    />
                    <button type="submit" className="login-btn" disabled={isLoading}>
                        {isLoading ? 'Verifying...' : 'Log In'}
                    </button>
                </form>
            )}

            {/* --- VIEW 2: FORCE PASSWORD CHANGE --- */}
            {step === 'changePassword' && (
                <form onSubmit={handleFirstTimeLogin} className="login-form fade-in">
                    <div style={{textAlign:'center', marginBottom:'15px', color:'#555'}}>
                        <FaLock style={{marginBottom:'5px'}}/>
                        <p style={{fontSize:'12px'}}>Create a new password to activate your account.</p>
                    </div>
                    <input
                        type="password"
                        name="newPassword"
                        placeholder="New Password" 
                        value={newPasswordData.newPassword}
                        onChange={handleNewPassChange}
                        required
                        className="minimal-input"
                        autoFocus
                    />
                    <input
                        type="password"
                        name="confirmPassword"
                        placeholder="Confirm New Password"
                        value={newPasswordData.confirmPassword}
                        onChange={handleNewPassChange}
                        required
                        className="minimal-input"
                    />
                <button 
                  type="submit" 
                  className="login-btn" 
                  disabled={isLoading} 
                  style={{
                      backgroundColor: '#2e7d32', 
                      width: '100%',        
                      whiteSpace: 'nowrap'  
                  }}
              >
                  {isLoading ? 'Activating...' : 'Set Password & Login'} <FaCheckCircle style={{marginLeft:'8px'}}/>
              </button>
                </form>
            )}
        </div>
    </div>
  );
};

export default LoginPage;