import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Mail, Lock, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';

function InputField({
  icon: Icon,
  value,
  onChange,
  placeholder,
  type,
  textColor,
  inputBg,
  inputBorder,
}: {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: string;
  textColor: string;
  inputBg: string;
  inputBorder: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}` }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(46,255,175,0.14)' }}>
        <Icon className="w-4 h-4" style={{ color: '#2EFFAF' }} />
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-sm"
        style={{ color: textColor }}
      />
    </div>
  );
}

export function AccountSecurity() {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const { isDark } = useTheme();

  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    setNewEmail(user?.email || '');
  }, [user?.email]);

  async function handleEmailUpdate() {
    if (!user?.email) return;
    const clean = newEmail.trim().toLowerCase();
    setEmailError(null);
    setEmailMessage(null);

    if (!clean) {
      setEmailError('Please enter an email address.');
      return;
    }
    if (clean === user.email.toLowerCase()) {
      setEmailError('New email must be different from your current email.');
      return;
    }

    try {
      setEmailSaving(true);
      const { error } = await supabase.auth.updateUser({ email: clean });
      if (error) throw error;
      localStorage.setItem('pendingVerificationEmail', clean);
      setEmailMessage('Verification email sent. Confirm the new email address to complete the change.');
    } catch (error: any) {
      setEmailError(error?.message || 'Could not update email right now.');
    } finally {
      setEmailSaving(false);
    }
  }

  async function handlePasswordUpdate() {
    if (!user?.email) return;
    setPasswordError(null);
    setPasswordMessage(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }

    try {
      setPasswordSaving(true);
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthError) throw new Error('Current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password updated successfully.');
    } catch (error: any) {
      setPasswordError(error?.message || 'Could not update password right now.');
    } finally {
      setPasswordSaving(false);
    }
  }

  const textColor = isDark ? '#FFFFFF' : '#1A1F2E';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';
  const inputBg = isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  return (
    <div className="min-h-screen pb-10" style={{ background: isDark ? '#0F1419' : '#F5F7FA' }}>
      <div className="p-6 flex items-center gap-4">
        <button
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
          title="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: textColor }}>Account Security</h1>
          <p className="text-sm" style={{ color: subColor }}>Manage login email and password</p>
        </div>
      </div>

      <div className="px-6 space-y-5 max-w-2xl">
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{ backgroundColor: isDark ? 'rgba(0,122,255,0.12)' : 'rgba(0,122,255,0.07)', border: `1px solid ${isDark ? 'rgba(0,122,255,0.35)' : 'rgba(0,122,255,0.2)'}` }}>
          <Shield className="w-5 h-5 mt-0.5" style={{ color: '#007AFF' }} />
          <p className="text-sm" style={{ color: subColor }}>
            Email changes require verification. Password changes require your current password for security.
          </p>
        </div>

        <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <h2 className="font-semibold" style={{ color: textColor }}>Change Email</h2>
          <p className="text-sm" style={{ color: subColor }}>Current email: {user?.email || '-'}</p>
          <InputField
            icon={Mail}
            value={newEmail}
            onChange={setNewEmail}
            placeholder="Enter new email"
            type="email"
            textColor={textColor}
            inputBg={inputBg}
            inputBorder={inputBorder}
          />
          {emailError && <p className="text-sm text-red-400 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{emailError}</p>}
          {emailMessage && <p className="text-sm text-[#2EFFAF] flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{emailMessage}</p>}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleEmailUpdate}
            disabled={emailSaving}
            className="w-full rounded-xl py-3 font-semibold text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] disabled:opacity-60"
          >
            {emailSaving ? 'Sending Verification...' : 'Update Email'}
          </motion.button>
        </div>

        <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <h2 className="font-semibold" style={{ color: textColor }}>Change Password</h2>
          <InputField
            icon={Lock}
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Current password"
            type="password"
            textColor={textColor}
            inputBg={inputBg}
            inputBorder={inputBorder}
          />
          <InputField
            icon={Shield}
            value={newPassword}
            onChange={setNewPassword}
            placeholder="New password"
            type="password"
            textColor={textColor}
            inputBg={inputBg}
            inputBorder={inputBorder}
          />
          <InputField
            icon={CheckCircle2}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirm new password"
            type="password"
            textColor={textColor}
            inputBg={inputBg}
            inputBorder={inputBorder}
          />
          {passwordError && <p className="text-sm text-red-400 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{passwordError}</p>}
          {passwordMessage && <p className="text-sm text-[#2EFFAF] flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{passwordMessage}</p>}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handlePasswordUpdate}
            disabled={passwordSaving}
            className="w-full rounded-xl py-3 font-semibold text-[#0F1419] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] disabled:opacity-60"
          >
            {passwordSaving ? 'Updating Password...' : 'Update Password'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
