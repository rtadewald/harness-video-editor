import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Projetos from './paginas/Projetos'
import Editor from './paginas/Editor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Projetos />} />
        <Route path="/p/:id" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
