import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import Subjects from './pages/Subjects'
import KnowledgeTree from './pages/KnowledgeTree'
import Skills from './pages/Skills'
import StudyLogs from './pages/StudyLogs'
import AiAssistant from './pages/AiAssistant'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/knowledge" element={<KnowledgeTree />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/study" element={<StudyLogs />} />
        <Route path="/ai-assistant" element={<AiAssistant />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  )
}
