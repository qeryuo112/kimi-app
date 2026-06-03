import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import NotFound from "./pages/NotFound"
import Subjects from './pages/Subjects'
import KnowledgeTree from './pages/KnowledgeTree'
import Skills from './pages/Skills'
import StudyLogs from './pages/StudyLogs'
import AiAssistant from './pages/AiAssistant'
import Settings from './pages/Settings'
import Plans from './pages/Plans'
import Questions from './pages/Questions'
import Todos from './pages/Todos'
import Login from './pages/Login'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/knowledge" element={<KnowledgeTree />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/study" element={<StudyLogs />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/ai-assistant" element={<AiAssistant />} />
            <Route path="/questions" element={<Questions />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}
