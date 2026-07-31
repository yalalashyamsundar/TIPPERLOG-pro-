import React, { useState } from 'react';
import { Truck, Lock, Mail, User, ShieldCheck, ArrowRight, UserPlus, LogIn, Eye, EyeOff, AlertCircle, CheckCircle2, Sparkles, Building, KeyRound, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  vehicleRegNo?: string;
}

interface LoginPageProps {
  ownerName?: string;
  vehicleRegNo?: string;
  onLoginSuccess: (userProfile?: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  ownerName = 'Tipper Owner',
  vehicleRegNo = '',
  onLoginSuccess
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState(ownerName || '');
  const [vehicleReg, setVehicleReg] = useState(vehicleRegNo || '');
  const [role, setRole] = useState<'Owner' | 'Driver' | 'Fleet Manager'>('Owner');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Get registered local users list with pre-seeded demo accounts
  const getRegisteredUsers = (): any[] => {
    try {
      const saved = localStorage.getItem('tipperlog_registered_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      // Seed initial default demo accounts if none exist
      const defaultAccounts = [
        {
          userId: 'usr_owner_tipperlog_com',
          email: 'owner@tipperlog.com',
          password: 'tipper123',
          fullName: ownerName || 'Tipper Owner',
          role: 'Owner',
          vehicleRegNo: vehicleRegNo || 'TS09-EX-1234'
        },
        {
          userId: 'usr_driver_tipperlog_com',
          email: 'driver@tipperlog.com',
          password: 'driver123',
          fullName: 'Ramesh (Driver)',
          role: 'Driver',
          vehicleRegNo: 'TS09-EX-1234'
        }
      ];
      localStorage.setItem('tipperlog_registered_users', JSON.stringify(defaultAccounts));
      return defaultAccounts;
    } catch {
      return [];
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanIdentifier = email.trim();
    const cleanPassword = password.trim();

    if (!cleanIdentifier || !cleanPassword) {
      setErrorMsg('Please enter your email address or phone number and password.');
      return;
    }

    setIsLoading(true);

    const isEmail = cleanIdentifier.includes('@');
    const normalizedEmail = isEmail
      ? cleanIdentifier.toLowerCase()
      : `${cleanIdentifier.replace(/[^0-9]/g, '')}@phone.tipperlog.com`;

    try {
      // 1. Try Supabase Auth first
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: cleanPassword
      });

      if (!authError && authData.user) {
        const userProfile: UserProfile = {
          userId: authData.user.id,
          email: authData.user.user_metadata?.phone_or_email || authData.user.email || cleanIdentifier,
          fullName: authData.user.user_metadata?.full_name || fullName || 'Tipper Owner',
          role: authData.user.user_metadata?.role || role,
          vehicleRegNo: authData.user.user_metadata?.vehicle_reg || vehicleReg
        };
        finishAuth(userProfile);
        return;
      }

      // 2. Validate against registered accounts (local database)
      const localUsers = getRegisteredUsers();
      const matchedUser = localUsers.find((u) => {
        const uEmail = (u.email || '').toLowerCase();
        const input = cleanIdentifier.toLowerCase();
        const inputDigits = cleanIdentifier.replace(/[^0-9]/g, '');
        const uDigits = uEmail.replace(/[^0-9]/g, '');

        const isMatch =
          uEmail === input ||
          (inputDigits.length >= 7 && uDigits.length >= 7 && inputDigits === uDigits);

        return isMatch && u.password === cleanPassword;
      });

      if (matchedUser) {
        const profile: UserProfile = {
          userId: matchedUser.userId || `usr_${matchedUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          email: matchedUser.email,
          fullName: matchedUser.fullName,
          role: matchedUser.role,
          vehicleRegNo: matchedUser.vehicleRegNo
        };
        finishAuth(profile);
        return;
      }

      // 3. Credentials do NOT match - Reject login and show error
      setErrorMsg('Invalid email/phone number or password. Please check your credentials or click Sign Up.');
    } catch (err: any) {
      console.warn('Login authentication failed:', err);
      setErrorMsg('Authentication failed. Invalid email/phone number or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }

    const identifier = email.trim();
    if (!identifier) {
      setErrorMsg('Please enter your email address or phone number');
      return;
    }

    const isEmail = identifier.includes('@');
    const isPhone = /^[+\d\s\-()]{7,15}$/.test(identifier);

    if (!isEmail && !isPhone) {
      setErrorMsg('Please enter a valid email address or 10-digit phone number');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setIsLoading(true);

    const normalizedEmail = isEmail
      ? identifier.toLowerCase()
      : `${identifier.replace(/[^0-9]/g, '')}@phone.tipperlog.com`;

    try {
      // Register in Supabase Auth if accessible
      const { data: signUpData } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: role,
            vehicle_reg: vehicleReg.trim(),
            phone_or_email: identifier
          }
        }
      });

      const cleanId = identifier.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const newUserId = signUpData?.user?.id || `usr_${cleanId}`;

      // Register in LocalStorage
      const existing = getRegisteredUsers();
      const updatedUsers = [
        ...existing.filter((u) => u.email.toLowerCase() !== identifier.toLowerCase() && u.userId !== newUserId),
        {
          userId: newUserId,
          email: identifier,
          password: password,
          fullName: fullName.trim(),
          role: role,
          vehicleRegNo: vehicleReg.trim(),
          createdAt: new Date().toISOString()
        }
      ];
      localStorage.setItem('tipperlog_registered_users', JSON.stringify(updatedUsers));

      setSuccessMsg('Account created successfully! Logging you in...');
      setTimeout(() => {
        finishAuth({
          userId: newUserId,
          email: identifier,
          fullName: fullName.trim(),
          role: role,
          vehicleRegNo: vehicleReg.trim()
        });
      }, 600);
    } catch (err: any) {
      console.warn('Signup warning:', err);
      // Local fallback creation
      const cleanId = identifier.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const localUserId = `usr_${cleanId}`;
      const existing = getRegisteredUsers();
      existing.push({
        userId: localUserId,
        email: identifier,
        password: password,
        fullName: fullName.trim(),
        role: role,
        vehicleRegNo: vehicleReg.trim()
      });
      localStorage.setItem('tipperlog_registered_users', JSON.stringify(existing));

      finishAuth({
        userId: localUserId,
        email: identifier,
        fullName: fullName.trim(),
        role: role,
        vehicleRegNo: vehicleReg.trim()
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanIdentifier = email.trim();
    const cleanNewPassword = password.trim();

    if (!cleanIdentifier) {
      setErrorMsg('Please enter your email address or phone number.');
      return;
    }

    if (!cleanNewPassword || cleanNewPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (cleanNewPassword !== confirmPassword.trim()) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    const isEmail = cleanIdentifier.includes('@');
    const normalizedEmail = isEmail
      ? cleanIdentifier.toLowerCase()
      : `${cleanIdentifier.replace(/[^0-9]/g, '')}@phone.tipperlog.com`;

    try {
      // 1. Trigger Supabase Auth password reset email if accessible
      if (isEmail) {
        try {
          await supabase.auth.resetPasswordForEmail(normalizedEmail, {
            redirectTo: window.location.origin
          });
        } catch (sErr) {
          console.warn('Supabase password reset note:', sErr);
        }
      }

      // 2. Update LocalStorage registered user records
      const localUsers = getRegisteredUsers();
      let updatedCount = 0;

      const updatedUsers = localUsers.map((u) => {
        const uEmail = (u.email || '').toLowerCase();
        const input = cleanIdentifier.toLowerCase();
        const inputDigits = cleanIdentifier.replace(/[^0-9]/g, '');
        const uDigits = uEmail.replace(/[^0-9]/g, '');

        const isMatch =
          uEmail === input ||
          (inputDigits.length >= 7 && uDigits.length >= 7 && inputDigits === uDigits);

        if (isMatch) {
          updatedCount++;
          return {
            ...u,
            password: cleanNewPassword
          };
        }
        return u;
      });

      if (updatedCount > 0) {
        localStorage.setItem('tipperlog_registered_users', JSON.stringify(updatedUsers));
        setSuccessMsg('Password updated successfully! Redirecting to Log In...');
      } else {
        setSuccessMsg('Password reset processed! Redirecting to Log In...');
      }

      setPassword(cleanNewPassword);
      setConfirmPassword('');
      setTimeout(() => {
        setMode('login');
      }, 1200);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      setErrorMsg('Failed to reset password. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const finishAuth = (profile: UserProfile) => {
    if (rememberMe) {
      localStorage.setItem('tipperlog_auth_logged_in', 'true');
      localStorage.setItem('tipperlog_user_profile', JSON.stringify(profile));
    } else {
      sessionStorage.setItem('tipperlog_auth_logged_in', 'true');
      sessionStorage.setItem('tipperlog_user_profile', JSON.stringify(profile));
    }
    onLoginSuccess(profile);
  };

  const fillQuickDemo = () => {
    setEmail('owner@tipperlog.com');
    setPassword('tipper123');
    setFullName(ownerName || 'Tipper Owner');
    setRole('Owner');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background blur elements */}
      <div className="absolute top-1/4 -left-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Form Container Card */}
      <div className="w-full max-w-md bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10">
        
        {/* App Logo & Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-3 shadow-inner">
            <Truck className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>TIPPERLOG</span>
            <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/30">
              PRO
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {mode === 'login'
              ? 'Sign in to access your trip logs & accounts'
              : mode === 'signup'
              ? 'Create an account to manage fleet & collaborator logs'
              : 'Reset your account password'}
          </p>
        </div>

        {/* Tab Switcher: Log In vs Sign Up */}
        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-6 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2 font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-extrabold'
                : 'text-zinc-400 hover:text-white cursor-pointer'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Log In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2 font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'signup'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-extrabold'
                : 'text-zinc-400 hover:text-white cursor-pointer'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Sign Up</span>
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* LOG IN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Email Address or Phone Number</span>
              </label>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="e.g. owner@tipperlog.com or 9876543210"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Password</span>
                </label>
                <button
                  type="button"
                  onClick={fillQuickDemo}
                  className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fill Demo Credentials</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter your password"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="text-[11px] text-amber-400 hover:underline font-medium flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>Forgot password? Reset here</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 mt-4 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Signing In...' : 'Log In to Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* RESET PASSWORD FORM */}
        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-3.5">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-start space-x-2.5">
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-400 font-bold">RESET YOUR PASSWORD</strong>
                <span className="text-[11px] text-zinc-300">
                  Enter your registered email or phone number along with your new password to update your login credentials.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Email Address or Phone Number</span>
              </label>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="e.g. owner@tipperlog.com or 9876543210"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>New Password (Min 6 characters)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter your new password"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Confirm New Password</span>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Repeat your new password"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 mt-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isLoading ? 'Updating Password...' : 'Reset & Update Password'}</span>
            </button>
          </form>
        )}

        {/* SIGN UP FORM */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Full Name / Business Name</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Email Address or Phone Number (User ID)</span>
              </label>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. ramesh@example.com or +91 98765 43210"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1 flex items-center gap-1">
                  <Building className="w-3 h-3 text-amber-400" />
                  <span>Account Role</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  <option value="Owner">Tipper Owner</option>
                  <option value="Fleet Manager">Fleet Manager</option>
                  <option value="Driver">Driver / Operator</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-amber-400" />
                  <span>Vehicle Reg. No</span>
                </label>
                <input
                  type="text"
                  value={vehicleReg}
                  onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                  placeholder="TS09-EX-1234"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-white focus:border-amber-400 focus:outline-none uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Password (Min 6 characters)</span>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Confirm Password</span>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 mt-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isLoading ? 'Creating Account...' : 'Complete Sign Up'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Footer Options */}
        <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-800 text-amber-500 focus:ring-0 accent-amber-500 w-3.5 h-3.5"
            />
            <span className="text-[11px]">Remember my account</span>
          </label>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="text-[11px] text-amber-400 hover:underline font-medium cursor-pointer"
          >
            {mode === 'login'
              ? 'Need an account? Sign Up'
              : mode === 'signup'
              ? 'Already registered? Log In'
              : 'Remembered your password? Log In'}
          </button>
        </div>

        {/* Security Info Badge */}
        <div className="mt-5 text-center">
          <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Cloud & Local Account Authentication</span>
          </p>
        </div>

      </div>
    </div>
  );
};
