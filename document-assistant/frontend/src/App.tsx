import { useState } from 'react';

function App() {
  const [messages, setMessages] = useState<{role: string, content: string, sources?: { source: string }[]}[]>([]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('http://localhost:3000/api/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      alert(data.message || 'Document processed!');
    } catch (error) {
      console.error(error);
      alert(error instanceof TypeError
        ? 'Cannot reach the backend. Start the backend server and try again.'
        : error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');

    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input }),
    });
    
    const data = await res.json();
    setMessages([...newMessages, { role: 'assistant', content: data.answer, sources: data.sources }]);
  };

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>Enterprise Knowledge Assistant</h2>
      
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f5f5f5' }}>
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button onClick={handleUpload}>Upload Document</button>
      </div>

      <div style={{ border: '1px solid #ccc', height: '400px', overflowY: 'scroll', padding: '20px', marginBottom: '20px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '15px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
            <strong>{msg.role === 'user' ? 'You' : 'Assistant'}:</strong>
            <p style={{ margin: '5px 0' }}>{msg.content}</p>
            {msg.sources && (
              <small style={{ color: 'gray' }}>
                Sources: {msg.sources.map(s => s.source).join(', ')}
              </small>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleChat} style={{ display: 'flex' }}>
        <input 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          style={{ flex: 1, padding: '10px' }} 
          placeholder="Ask about company policies..." 
        />
        <button type="submit" style={{ padding: '10px' }}>Send</button>
      </form>
    </div>
  );
}

export default App;