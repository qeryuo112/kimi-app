import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

// Suppress React 19 "insertBefore NotFoundError" caused by browser extensions
// (translation tools, grammarly, etc.) modifying DOM nodes managed by React.
// This is a known React 19 issue that doesn't affect functionality.
const originalInsertBefore = Node.prototype.insertBefore
Node.prototype.insertBefore = function<T extends Node>(newNode: T, referenceNode: Node | null): T {
  try {
    return originalInsertBefore.call(this, newNode, referenceNode)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      // Node was moved by a browser extension; append instead of insert
      return originalInsertBefore.call(this, newNode, null)
    }
    throw e
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
