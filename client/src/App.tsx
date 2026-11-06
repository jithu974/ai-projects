import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { type Message } from './types/chat';

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'user',
      text: 'Can you explain async/await in JavaScript with an example?',
      timestamp: '10:24 AM'
    },
    {
      id: '2',
      role: 'model',
      text: `Absolutely! async/await is a modern way to handle asynchronous operations in JavaScript. It makes code easier to read and write compared to traditional promises.

✦ Key Concepts
• async: Declares a function as asynchronous and returns a Promise.
• await: Pauses the execution of an async function until the Promise is resolved.

</> Example
\`\`\`javascript
async function fetchUser() {
  try {
    const response = await fetch('https://api.example.com/user/1');
    const user = await response.json();
    return user;
  } catch (error) {
    console.error('Failed to fetch user:', error);
  }
}

fetchUser().then(user => {
  console.log('User:', user);
});
\`\`\`

In this example, await pauses execution until the fetch request completes and the response is converted to JSON. This makes the code flow look synchronous and easy to follow.`,
      timestamp: '10:24 AM'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (userInput: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch('http://localhost:5001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput, history: historyPayload })
      });

      const data = await res.json();
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: data.reply || 'No response returned from the assistant.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: 'Error communicating with Syntax AI API service.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
  }

  return (
    <div className="flex h-screen w-screen bg-syntax-bg overflow-hidden text-slate-100">
      <Sidebar onNewChat={handleNewChat} />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <TopNav />
        <MessageList messages={messages} />
        <ChatInput onSendMessage={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default App;