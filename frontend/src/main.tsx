import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Projetos from './paginas/Projetos'
import Editor from './paginas/Editor'
import Calibragem from './paginas/Calibragem'
import Referencias from './paginas/Referencias'
import Heuristica from './paginas/Heuristica'
import Banco from './paginas/Banco'
import RevisaoReferencia from './paginas/RevisaoReferencia'
import { RenderChuva, RenderProjeto } from './paginas/Render'
import Presets from './paginas/Presets'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Projetos />} />
        <Route path="/p/:id" element={<Editor />} />
        <Route path="/referencias" element={<Referencias />} />
        <Route path="/calibragem" element={<Calibragem />} />
        <Route path="/calibragem/:id" element={<RevisaoReferencia />} />
        <Route path="/heuristica" element={<Heuristica />} />
        <Route path="/banco" element={<Banco />} />
        <Route path="/presets" element={<Presets />} />
        <Route path="/render/chuva" element={<RenderChuva />} />
        <Route path="/render/p/:id" element={<RenderProjeto />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
