import React, { useState } from 'react';

export default function App() {
  const [status, setStatus] = useState<string>('Ready to test connection.');
  const [loading, setLoading] = useState<boolean>(false);

  const testConnection = async () => {
    setLoading(true);
    setStatus('Contacting Gemini API...');
    try {
      const response = await fetch('http://localhost:3000/api/test-ai', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setStatus(`Success: ${data.message}`);
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setStatus(`Network Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Enterprise Agent Platform</h1>
      <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px' }}>
        <h3>System Check</h3>
        <p><strong>Status:</strong> {status}</p>
        <button 
          onClick={testConnection} 
          disabled={loading}
          style={{ padding: '10px 20px', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Testing...' : 'Test Gemini Connection'}
        </button>
      </div>
    </div>
  );
}