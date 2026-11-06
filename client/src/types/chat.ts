// Frontend Chat Types for chat messages and sessions

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  category: 'Today' | 'Yesterday' | 'Previous';
}