import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Direct Supabase client - bypassing everything
const directSupabase = createClient(
  'https://apojatplmfsbimgcyjoo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwb2phdHBsbWZzYmltZ2N5am9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjcyMjQsImV4cCI6MjA4NjM0MzIyNH0.eWizHl9jMS-E-SZ_JMmmZooYN9nuEufxupWOXCOulv8'
);

export function TestSignup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState('');

  const testSignup = async () => {
    setResult('Testing...');
    console.clear();
    
    try {
      console.log('=== DIRECT SUPABASE TEST ===');
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('Email type:', typeof email);
      console.log('Password type:', typeof password);
      
      const payload = {
        email: email,
        password: password
      };
      
      console.log('Payload:', payload);
      console.log('Payload JSON:', JSON.stringify(payload));
      
      const { data, error } = await directSupabase.auth.signUp(payload);
      
      if (error) {
        console.error('ERROR:', error);
        setResult(`❌ ERROR: ${error.message}`);
      } else {
        console.log('SUCCESS:', data);
        setResult(`✅ SUCCESS! User created: ${data.user?.email}`);
      }
    } catch (err: any) {
      console.error('CATCH:', err);
      setResult(`❌ CATCH: ${err.message}`);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#1A1F2E', 
      padding: '40px',
      color: 'white',
      fontFamily: 'monospace'
    }}>
      <h1 style={{ color: '#2EFFAF', marginBottom: '20px' }}>🧪 DIRECT SUPABASE TEST</h1>
      
      <p style={{ marginBottom: '20px', color: '#fff', opacity: 0.7 }}>
        This bypasses ALL our code and talks directly to Supabase.
        <br/>Open console (F12) to see detailed logs.
      </p>

      <div style={{ maxWidth: '400px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '16px'
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password123"
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '16px'
            }}
          />
        </div>

        <button
          onClick={testSignup}
          disabled={!email || !password}
          style={{
            width: '100%',
            padding: '12px',
            background: 'linear-gradient(135deg, #2EFFAF 0%, #007AFF 100%)',
            border: 'none',
            borderRadius: '8px',
            color: '#0A0F1E',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            opacity: (!email || !password) ? 0.5 : 1
          }}
        >
          🧪 TEST SIGNUP
        </button>

        {result && (
          <div style={{
            marginTop: '20px',
            padding: '15px',
            background: result.includes('✅') ? 'rgba(46,255,175,0.1)' : 'rgba(255,50,50,0.1)',
            border: `1px solid ${result.includes('✅') ? '#2EFFAF' : '#ff3232'}`,
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
            fontSize: '14px'
          }}>
            {result}
          </div>
        )}
      </div>

      <div style={{ marginTop: '40px', fontSize: '14px', opacity: 0.6 }}>
        <h3 style={{ color: '#2EFFAF', marginBottom: '10px' }}>📋 What This Tests:</h3>
        <ul style={{ lineHeight: '1.8' }}>
          <li>✅ Direct Supabase SDK call (no context, no wrappers)</li>
          <li>✅ Hardcoded credentials (rules out env var issues)</li>
          <li>✅ Simple payload (just email + password)</li>
          <li>✅ Console logging (see exact data being sent)</li>
        </ul>
        <p style={{ marginTop: '15px' }}>
          If this works → Problem is in our app code
          <br/>
          If this fails → Problem is with Supabase/network
        </p>
      </div>
    </div>
  );
}
