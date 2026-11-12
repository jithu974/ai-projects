import React, { useState } from 'react';

export default function App() {
  const [status, setStatus] = useState<string>('Ready to test connection.');
  const [loading, setLoading] = useState<boolean>(false);
  const [outputData, setOutputData] = useState<any>(null);
  const [outputTitle, setOutputTitle] = useState<string>('');

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

  // Call the Supervisor Agent
  const runSupervisor = async () => {
    setLoading(true);
    setOutputData(null);
    setStatus('Supervisor is planning...');
    
    try {
      const response = await fetch('http://localhost:3000/api/test-supervisor', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setStatus('Supervisor created execution plan successfully.');
        setOutputTitle('Supervisor Execution Plan');
        setOutputData(data.data);
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setStatus(`Network Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // CALL THE RESEARCH AGENT
  const runResearchAgent = async () => {
    setLoading(true);
    setOutputData(null);
    setStatus('Research Agent is analyzing...');
    
    try {
      const response = await fetch('http://localhost:3000/api/test-research', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setStatus('Research Agent completed successfully.');
        setOutputData(data.data); 
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setStatus(`Network Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // CALL THE FULL ORCHESTRATOR WORKFLOW
  const runFullWorkflow = async () => {
    setLoading(true);
    setOutputData(null);
    setStatus('Orchestrator is running the full multi-agent workflow. This will take ~15 seconds...');
    
    try {
      const response = await fetch('http://localhost:3000/api/run-workflow', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setStatus('Workflow completed successfully.');
        setOutputTitle('Final Task State (Memory)');
        setOutputData(data.data);
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
    <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Enterprise Agent Platform</h1>
      
      <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px' }}>
        <h3>System Status: {status}</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {/* <button onClick={testConnection}>... */}
          {/* <button onClick={runResearchAgent}>... */}
          {/* <button onClick={runSupervisor}>... */}
          <button onClick={runFullWorkflow} disabled={loading} style={{ padding: '10px 20px', background: '#0052cc', color: 'white', border: 'none', borderRadius: '4px' }}>
            {loading ? 'Processing...' : 'Run Full Multi-Agent Workflow'}
          </button>
        </div>
      </div>

      {outputData && (
        <div style={{ padding: '20px', border: '1px solid #FF5630', borderRadius: '8px', marginTop: '20px', background: '#f4f5f7' }}>
          <h3>{outputTitle}</h3>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', padding: '15px', borderRadius: '4px', fontSize: '13px', maxHeight: '600px', overflowY: 'auto' }}>
            {JSON.stringify(outputData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}