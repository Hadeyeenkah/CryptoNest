import React from 'react';

const EnvDebug = () => {
  const envVars = {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_APP_ID: import.meta.env.VITE_APP_ID,
    VITE_EMAILJS_SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID,
    VITE_EMAILJS_TEMPLATE_ID: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    VITE_EMAILJS_PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
    VITE_PLATFORM_NAME: import.meta.env.VITE_PLATFORM_NAME,
    VITE_SUPPORT_EMAIL: import.meta.env.VITE_SUPPORT_EMAIL,
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY
  };

  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#f5f5f5', 
      margin: '20px', 
      borderRadius: '8px',
      fontFamily: 'monospace'
    }}>
      <h3>Environment Variables Debug</h3>
      <p><strong>NODE_ENV:</strong> {import.meta.env.NODE_ENV}</p>
      <p><strong>DEV:</strong> {import.meta.env.DEV ? 'true' : 'false'}</p>
      <p><strong>PROD:</strong> {import.meta.env.PROD ? 'true' : 'false'}</p>
      <hr />
      <h4>Custom Environment Variables:</h4>
      {Object.entries(envVars).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '8px' }}>
          <strong>{key}:</strong> {
            value ? 
              (key.includes('KEY') || key.includes('API') ? '***SET***' : value) : 
              <span style={{ color: 'red' }}>NOT SET</span>
          }
        </div>
      ))}
      <hr />
      <h4>All import.meta.env:</h4>
      <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '200px' }}>
        {JSON.stringify(import.meta.env, null, 2)}
      </pre>
    </div>
  );
};

export default EnvDebug;