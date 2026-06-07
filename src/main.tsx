import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ThemeProvider } from 'next-themes'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

console.log("[Theme-DEBUG] main.tsx 执行, html class:", document.documentElement.className);

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </ThemeProvider>
  </BrowserRouter>,
)

setTimeout(() => {
  console.log("[Theme-DEBUG] 渲染后 html class:", document.documentElement.className);
  console.log("[Theme-DEBUG] 渲染后 html style:", document.documentElement.style.cssText);
}, 500);

