
import { useEffect, useState, type FormEvent } from 'react';
import {
  ShieldCheck,
  LockKeyhole,
  FolderOpen,
  FileText,
  Cloud,
  ArrowRight,
  Eye,
  EyeOff,
  Shield,
  LogOut,
  Users,
  CheckCircle2,
} from 'lucide-react';

import { supabase } from './lib/supabase';
import Workspace from './Workspace';
import './App.css';

type UserRole = 'member' | 'super_admin';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  is_active: boolean;
}

type AuthMode = 'login' | 'register';

function App() {
  const [loading, setLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [accessRole, setAccessRole] = useState<UserRole>('member');

  // Controls whether the landing page or authentication page is displayed.
  const [showHome, setShowHome] = useState(true);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error('Unable to load your account profile.');
    }

    if (!data.is_active) {
      throw new Error(
        'Your account is currently inactive. Contact the administrator.'
      );
    }

    if (data.role !== 'member' && data.role !== 'super_admin') {
      throw new Error('Invalid account role.');
    }

    return data as UserProfile;
  }

  // Restore an existing Supabase session.
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session?.user) {
          const userProfile = await loadProfile(data.session.user.id);

          if (!mounted) return;

          setProfile(userProfile);
        }
      } catch (error) {
        console.error('Session initialization error:', error);

        if (mounted) {
          await supabase.auth.signOut();
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setSessionChecked(true);
        }
      }
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && mounted) {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  function resetMessages() {
    setAuthError('');
    setAuthSuccess('');
  }

  // Open the correct login portal.
  function openLogin(role: UserRole) {
    setShowHome(false);
    setAccessRole(role);
    setAuthMode('login');
    setAuthError('');
    setAuthSuccess('');
    setPassword('');
    setFullName('');
    setShowPassword(false);
  }

  // Login and registration.
  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }

    if (authMode === 'register' && !fullName.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }

    if (authMode === 'register' && password.length < 6) {
      setAuthError('Password must contain at least 6 characters.');
      return;
    }

    setSubmitting(true);

    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: 'member',
            },
          },
        });

        if (error) throw error;

        if (data.user && data.session) {
          const userProfile = await loadProfile(data.user.id);
          setProfile(userProfile);
          setAuthSuccess('Your account has been created successfully.');
        } else {
          setAuthSuccess(
            'Registration successful. Please verify your email if required, then sign in.'
          );
          setAuthMode('login');
          setPassword('');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        if (!data.user) {
          throw new Error('Login failed. Please try again.');
        }

        const userProfile = await loadProfile(data.user.id);

        if (userProfile.role !== accessRole) {
          await supabase.auth.signOut();

          throw new Error(
            accessRole === 'super_admin'
              ? 'This account does not have Super Admin access.'
              : 'Please use the correct login portal for this account.'
          );
        }

        setProfile(userProfile);
        setPassword('');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong.';

      setAuthError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Logout.
  async function handleLogout() {
    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      setProfile(null);
      setEmail('');
      setPassword('');
      setFullName('');
      setAuthMode('login');
      setAccessRole('member');
      setShowHome(true);
      setShowPassword(false);
      resetMessages();
    } catch (error) {
      console.error('Logout error:', error);
      setAuthError(
        error instanceof Error ? error.message : 'Unable to log out.'
      );
    } finally {
      setLoading(false);
    }
  }

  // Loading screen.
  if (loading || !sessionChecked) {
    return (
      <div className="loading-screen">
        <div>
          <div className="spinner" />
          <p>Loading SafeBox...</p>
        </div>
      </div>
    );
  }

  // Authenticated dashboard.
  if (profile) {
    return (
      <div className="dashboard-screen">
        <div
          className="dashboard-main"
          style={{ width: '100%', marginLeft: 0 }}
        >
          <header className="dashboard-topbar">
            <div className="brand">
              <div className="brand-icon">
                <ShieldCheck size={22} />
              </div>
              <span className="brand-name">SafeBox</span>
            </div>

            <div className="topbar-right">
              <div className="user-avatar">
                {(profile.full_name || profile.email || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="user-info">
                <strong>{profile.full_name || 'SafeBox User'}</strong>
                <span>
                  {profile.role === 'super_admin'
                    ? 'Super Administrator'
                    : 'Member'}
                </span>
              </div>

              <button
                className="secondary-button"
                onClick={handleLogout}
                type="button"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </header>

          <Workspace userId={profile.id} role={profile.role} />
        </div>
      </div>
    );
  }

  // Landing page.
  if (showHome) {
    return (
      <div className="home-screen">
        <nav className="home-navbar">
          <div className="brand">
            <div className="brand-icon">
              <ShieldCheck size={23} />
            </div>
            <span className="brand-name">SafeBox</span>
          </div>

          <div className="nav-actions">
            <button
              className="secondary-button"
              onClick={() => openLogin('member')}
              type="button"
            >
              Member Login
            </button>

            <button
              className="primary-button"
              onClick={() => openLogin('super_admin')}
              type="button"
            >
              <Shield size={16} />
              Admin Login
            </button>
          </div>
        </nav>

        <section className="home-hero">
          <div className="hero-content">
            <div className="hero-tag">
              <ShieldCheck size={15} />
              Secure Digital File Management
            </div>

            <h1 className="hero-title">
              Your files.
              <br />
              Your space.
              <br />
              <span>One secure place.</span>
            </h1>

            <p className="hero-description">
              Store, organize and access your important documents in one
              secure workspace. Manage your folders and share files with
              registered members.
            </p>

            <div className="hero-buttons">
              <button
                className="primary-button"
                onClick={() => openLogin('member')}
                type="button"
              >
                Get Started
                <ArrowRight size={17} />
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  setShowHome(false);
                  setAuthMode('register');
                  setAccessRole('member');
                  resetMessages();
                }}
                type="button"
              >
                Create Account
              </button>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-card">
              <div className="hero-card-icon">
                <ShieldCheck size={35} />
              </div>

              <h3>Your personal file vault</h3>

              <p>
                A simple and secure way to keep your digital documents
                organized and accessible.
              </p>

              <div className="hero-feature">
                <span className="feature-check">
                  <CheckCircle2 size={16} />
                </span>
                Private file storage
              </div>

              <div className="hero-feature">
                <span className="feature-check">
                  <CheckCircle2 size={16} />
                </span>
                Organized folders
              </div>

              <div className="hero-feature">
                <span className="feature-check">
                  <CheckCircle2 size={16} />
                </span>
                Controlled file sharing
              </div>
            </div>
          </div>
        </section>

        <section className="home-features">
          <div className="section-heading">
            <span className="eyebrow">SAFEBOX FEATURES</span>
            <h2>Everything you need to manage files</h2>
            <p>One workspace for your important documents.</p>
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-card-icon">
                <LockKeyhole size={23} />
              </div>
              <h3>Secure Access</h3>
              <p>
                Sign in securely and access only the files permitted for
                your account.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <FolderOpen size={23} />
              </div>
              <h3>Easy Organization</h3>
              <p>
                Create folders and subfolders to organize your documents
                in one place.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <Cloud size={23} />
              </div>
              <h3>Cloud Storage</h3>
              <p>
                Upload and access your documents through your secure
                online workspace.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <FileText size={23} />
              </div>
              <h3>File Management</h3>
              <p>
                Preview, download, rename and manage your uploaded files.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <Users size={23} />
              </div>
              <h3>Member Sharing</h3>
              <p>
                Share selected documents with other registered SafeBox
                members.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-card-icon">
                <ShieldCheck size={23} />
              </div>
              <h3>Admin Management</h3>
              <p>
                Super Admin can manage member accounts and oversee
                stored documents.
              </p>
            </div>
          </div>
        </section>

        <footer className="home-footer">
          © {new Date().getFullYear()} SafeBox. Secure file management.
        </footer>
      </div>
    );
  }

  // Login and registration screen.
  return (
    <div className="auth-screen">
      <aside className="auth-side-panel">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={23} />
          </div>
          <span className="brand-name">SafeBox</span>
        </div>

        <div className="auth-side-content">
          <div className="hero-tag">
            <ShieldCheck size={15} />
            Secure Workspace
          </div>

          <h1>
            Keep your important files safe and organized.
          </h1>

          <p>
            Access your personal documents, organize folders and share
            selected files with registered members.
          </p>
        </div>

        <div className="auth-side-bottom">
          Secure digital document management
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-form-wrap">
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setShowHome(true);
              setAuthMode('login');
              setAccessRole('member');
              resetMessages();
            }}
          >
            ← Back to home
          </button>

          <div style={{ marginTop: 25 }}>
            <span className="eyebrow">
              {accessRole === 'super_admin'
                ? 'ADMINISTRATOR ACCESS'
                : authMode === 'register'
                  ? 'CREATE YOUR ACCOUNT'
                  : 'MEMBER ACCESS'}
            </span>

            <h2>
              {authMode === 'register'
                ? 'Create your account'
                : accessRole === 'super_admin'
                  ? 'Super Admin Login'
                  : 'Welcome back'}
            </h2>

            <p>
              {authMode === 'register'
                ? 'Register to create your personal SafeBox workspace.'
                : accessRole === 'super_admin'
                  ? 'Sign in using your administrator account.'
                  : 'Sign in to access your secure file workspace.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            {authMode === 'register' && (
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>

              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    authMode === 'register'
                      ? 'new-password'
                      : 'current-password'
                  }
                  style={{ paddingRight: 48 }}
                  required
                />

                <button
                  type="button"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 36,
                    minWidth: 36,
                    height: 36,
                    minHeight: 36,
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 0,
                    background: 'transparent',
                    color: '#7d8798',
                    boxShadow: 'none',
                    zIndex: 2,
                  }}
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>

              {authMode === 'register' && (
                <small className="muted">
                  Use at least 6 characters.
                </small>
              )}
            </div>

            {authError && (
              <div className="auth-error" role="alert">
                {authError}
              </div>
            )}

            {authSuccess && (
              <div className="auth-success" role="status">
                {authSuccess}
              </div>
            )}

            <button
              className="primary-button full-width"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? 'Please wait...'
                : authMode === 'register'
                  ? 'Create Account'
                  : 'Sign In'}

              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          {accessRole === 'member' && (
            <div className="auth-switch">
              {authMode === 'register'
                ? 'Already have an account?'
                : "Don't have an account?"}{' '}

              <button
                type="button"
                onClick={() => {
                  setAuthMode(
                    authMode === 'register' ? 'login' : 'register'
                  );
                  resetMessages();
                }}
              >
                {authMode === 'register' ? 'Sign In' : 'Register'}
              </button>
            </div>
          )}

          <div className="auth-switch">
            {accessRole === 'super_admin' ? (
              <button
                type="button"
                onClick={() => openLogin('member')}
              >
                Member Login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openLogin('super_admin')}
              >
                Super Admin Login
              </button>
            )}
          </div>

          <p
            className="auth-side-bottom"
            style={{
              textAlign: 'center',
              marginTop: 25,
              color: '#8992a4',
            }}
          >
            <ShieldCheck
              size={14}
              style={{ verticalAlign: 'middle' }}
            />{' '}
            Your account access is protected by SafeBox.
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
