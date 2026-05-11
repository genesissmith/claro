import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { INITIAL_DOCS } from './data.js'
import { analyzeDocument } from './analyzeDocument.js'
import { loadDocs, saveDocs, enqueue, useSyncEngine } from './offlineStore.js'

// ─── Icon ─────────────────────────────────────────────────────────────────────
function Icon({ name, fill = 0, size = 24, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      }}
    >{name}</span>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function t(obj, lang) { return obj?.[lang] ?? obj?.en ?? '' }

const URGENCY_CONFIG = {
  'act-now':  { labelEn: 'Act now',  labelEs: 'Actuar ahora', textCls: 'text-error',         bgCls: 'bg-error-container',     borderCls: 'border-l-4 border-error'             },
  'act-soon': { labelEn: 'Act soon', labelEs: 'Actuar pronto', textCls: 'text-secondary',     bgCls: 'bg-secondary-container', borderCls: 'border-l-4 border-secondary-container'},
  'done':     { labelEn: 'Done',     labelEs: 'Hecho',         textCls: 'text-primary',       bgCls: 'bg-primary-fixed',       borderCls: ''                                    },
}

const CATEGORY_CONFIG = {
  utility:    { bg: 'bg-error-container',     fg: 'text-on-error-container'   },
  medical:    { bg: 'bg-secondary-container', fg: 'text-on-secondary-fixed'   },
  school:     { bg: 'bg-primary-fixed',       fg: 'text-on-primary-fixed'     },
  legal:      { bg: 'bg-surface-container-high', fg: 'text-on-surface-variant'},
  government: { bg: 'bg-surface-container-high', fg: 'text-on-surface-variant'},
  housing:    { bg: 'bg-primary-fixed',       fg: 'text-on-primary-fixed'     },
  insurance:  { bg: 'bg-primary-fixed',       fg: 'text-on-primary-fixed'     },
}

function stepsLeft(doc) { return doc.steps.filter(s => !s.done).length }

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ dark = false }) {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
  useEffect(() => {
    const id = setInterval(() =>
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    15000)
    return () => clearInterval(id)
  }, [])
  const cls = dark ? 'text-white/90' : 'text-on-background'
  return (
    <div className={`flex items-center justify-between px-5 pt-2 pb-1 text-xs font-semibold ${cls}`}>
      <span className="tabular-nums">{time}</span>
      <div className="flex items-center gap-1.5">
        <Icon name="signal_cellular_alt" size={14} className={dark ? 'text-white/80' : 'text-on-surface-variant'} />
        <Icon name="wifi" size={14} className={dark ? 'text-white/80' : 'text-on-surface-variant'} />
        <Icon name="battery_full" size={16} className={dark ? 'text-white/80' : 'text-on-surface-variant'} />
      </div>
    </div>
  )
}

// ─── Sync banner ──────────────────────────────────────────────────────────────
function SyncBanner({ online, syncing, queueLen, lastSynced, lang }) {
  const [showSynced, setShowSynced] = useState(false)

  useEffect(() => {
    if (!lastSynced) return
    setShowSynced(true)
    const t = setTimeout(() => setShowSynced(false), 2500)
    return () => clearTimeout(t)
  }, [lastSynced])

  if (online && !syncing && !showSynced) return null

  const es = lang === 'es'

  let icon, text, bg, textCls
  if (!online) {
    icon    = 'wifi_off'
    text    = queueLen > 0
      ? (es ? `Sin conexión · ${queueLen} cambio${queueLen > 1 ? 's' : ''} pendiente${queueLen > 1 ? 's' : ''}` : `Offline · ${queueLen} change${queueLen > 1 ? 's' : ''} pending`)
      : (es ? 'Sin conexión — los cambios se guardan localmente' : 'Offline — changes saved locally')
    bg      = 'bg-secondary-container'
    textCls = 'text-on-secondary-container'
  } else if (syncing) {
    icon    = 'sync'
    text    = es ? 'Sincronizando cambios…' : 'Syncing changes…'
    bg      = 'bg-primary-fixed'
    textCls = 'text-on-primary-fixed'
  } else {
    icon    = 'cloud_done'
    text    = es ? 'Todo guardado' : 'All changes saved'
    bg      = 'bg-primary-fixed'
    textCls = 'text-on-primary-fixed'
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-2 ${bg} animate-fade-in`}>
      <Icon name={icon} size={14} className={`${syncing ? 'animate-spin-slow' : ''} ${textCls}`} />
      <span className={`text-xs font-semibold flex-1 ${textCls}`}>{text}</span>
    </div>
  )
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────
function BottomNav({ screen, onNavigate, lang }) {
  const items = [
    { id: 'home',     icon: 'home',          label: { en: 'Home',     es: 'Inicio'     } },
    { id: 'scan',     icon: 'photo_camera',  label: { en: 'Scan',     es: 'Escanear'   } },
    { id: 'calendar', icon: 'calendar_month',label: { en: 'Calendar', es: 'Calendario' } },
    { id: 'archive',  icon: 'settings',      label: { en: 'Settings', es: 'Ajustes'    } },
  ]
  const isHome     = screen === 'home'
  const isScan     = screen === 'scan' || screen === 'processing' || screen === 'result' || screen === 'uncertain' || screen === 'page-summary'
  const isCalendar = screen === 'calendar'
  const isArchive  = screen === 'archive'
  const activeMap  = { home: isHome, scan: isScan, calendar: isCalendar, archive: isArchive }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-surface border-t border-outline-variant z-50">
      <div className="flex items-center justify-around px-2 pt-2 pb-4">
        {items.map(({ id, icon, label }) => {
          const active = activeMap[id]
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex flex-col items-center gap-1 min-w-[64px] py-1 transition-opacity active:opacity-60"
            >
              <div className={`flex items-center justify-center w-16 h-8 rounded-full transition-colors duration-200 ${active ? 'bg-secondary-container' : ''}`}>
                <Icon name={icon} fill={active ? 1 : 0} size={22} className={active ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'} />
              </div>
              <span className={`text-[11px] font-semibold leading-none ${active ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'}`}>
                {t(label, lang)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Language toggle pill (shared across all screens) ────────────────────────
function LangToggle({ lang, onChange }) {
  return (
    <div className="flex items-center rounded-full border border-outline-variant overflow-hidden text-xs font-bold">
      {['en', 'es'].map(l => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`px-2.5 py-1 transition-colors ${lang === l ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ─── Document card (inbox) ────────────────────────────────────────────────────
function DocumentCard({ doc, lang, onClick }) {
  const cat = CATEGORY_CONFIG[doc.category] ?? CATEGORY_CONFIG.government
  const urg = doc.done ? URGENCY_CONFIG.done : (URGENCY_CONFIG[doc.urgency] ?? URGENCY_CONFIG['act-soon'])
  const urgLabel = doc.done
    ? (lang === 'es' ? `Completado el ${t(doc.receivedDate, lang)}` : `Completed ${t(doc.receivedDate, lang)}`)
    : t(doc.deadlineLabel, lang)

  return (
    <div
      onClick={onClick}
      className={`pressable flex items-center gap-3 bg-surface-container-lowest rounded-2xl p-4 shadow-sm ${doc.done ? '' : urg.borderCls}`}
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${cat.bg}`}>
        <Icon name={doc.icon} fill={1} size={22} className={cat.fg} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-background text-sm leading-snug">{t(doc.title, lang)}</p>
        <p className={`text-sm mt-0.5 font-medium ${doc.done ? 'text-primary' : urg.textCls}`}>{urgLabel}</p>
      </div>
      <Icon name="chevron_right" size={20} className="text-outline flex-shrink-0" />
    </div>
  )
}

// ─── Step item ────────────────────────────────────────────────────────────────
function StepItem({ step, index, lang, onToggle }) {
  return (
    <div className="flex gap-3 items-start">
      {/* Ordered number badge */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center mt-0.5">
        <span className={`text-xs font-bold ${step.done ? 'text-outline' : 'text-primary'}`}>{index + 1}</span>
      </div>

      {/* Content */}
      <div className="flex-1 pb-3 border-b border-outline-variant">
        <p className={`font-semibold text-sm leading-snug ${step.done ? 'text-outline line-through' : 'text-on-background'}`}>
          {t(step.title, lang)}
        </p>
        <p className={`text-sm mt-1 leading-relaxed ${step.done ? 'text-outline' : 'text-on-surface-variant'}`}>
          {t(step.detail, lang)}
        </p>
        {step.phone && (
          <a
            href={`tel:${step.phone.replace(/[^\d+]/g, '')}`}
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 mt-2 bg-primary-fixed px-3 py-1.5 rounded-full active:opacity-70"
          >
            <Icon name="phone" size={14} className="text-primary" />
            <span className="text-sm font-semibold text-primary">{step.phone}</span>
          </a>
        )}
      </div>

      {/* Checkbox — only action that marks done */}
      <button
        onClick={() => onToggle(step.id)}
        className="flex-shrink-0 mt-0.5 p-0.5 active:opacity-60"
        aria-label={step.done ? (lang === 'es' ? 'Desmarcar' : 'Mark incomplete') : (lang === 'es' ? 'Marcar hecho' : 'Mark done')}
      >
        <Icon
          name={step.done ? 'check_box' : 'check_box_outline_blank'}
          fill={step.done ? 1 : 0}
          size={24}
          className={step.done ? 'text-primary' : 'text-outline-variant'}
        />
      </button>
    </div>
  )
}

// ─── Accordion section ────────────────────────────────────────────────────────
function Accordion({ icon, title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-outline-variant">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-5 py-4 text-left pressable"
      >
        <div className="flex items-center gap-3">
          <Icon name={icon} size={20} fill={1} className="text-primary" />
          <span className="font-semibold text-sm text-on-background">{title}</span>
        </div>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} className="text-outline" />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

// ─── SCREEN 0: Language picker ────────────────────────────────────────────────
function LanguageScreen({ onChoose }) {
  const [selected, setSelected] = useState(null)

  const options = [
    { code: 'en', label: 'English', abbr: 'EN', iconBg: 'bg-primary-fixed',       iconText: 'text-primary'              },
    { code: 'es', label: 'Español', abbr: 'ES', iconBg: 'bg-secondary-container',  iconText: 'text-on-secondary-container'},
  ]

  return (
    <div className="screen bg-surface-container-lowest flex flex-col">
      <StatusBar />

      {/* Logo */}
      <div className="px-6 pt-1 flex items-baseline gap-1">
        <span className="text-xl font-black text-primary tracking-tight">claro</span>
        <span className="logo-sun" />
      </div>

      {/* Hero area with HOLA / HELLO and woman */}
      <div className="relative flex items-center justify-center mx-6 mt-1 mb-3 rounded-3xl bg-primary-fixed overflow-hidden" style={{height: 240}}>
        {/* HOLA! */}
        <span className="absolute top-5 left-5 text-4xl font-black text-primary leading-none select-none"
          style={{fontStyle:'italic', transform:'rotate(-6deg)', textShadow:'0 2px 0 rgba(0,0,0,0.06)'}}>
          HOLA!
        </span>
        {/* HELLO */}
        <span className="absolute top-8 right-4 text-3xl font-black text-secondary leading-none select-none"
          style={{fontStyle:'italic', transform:'rotate(7deg)', textShadow:'0 2px 0 rgba(0,0,0,0.06)'}}>
          HELLO!
        </span>

        {/* Woman SVG — same character as onboarding */}
        <svg viewBox="0 0 160 148" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-48 h-44 mt-6">
          <ellipse cx="80" cy="130" rx="38" ry="22" fill="#0c5252" opacity="0.15"/>
          <rect x="52" y="94" width="56" height="42" rx="14" fill="#0c5252"/>
          <path d="M72 94 Q80 104 88 94" stroke="#b1eeed" strokeWidth="2" fill="none"/>
          <path d="M52 105 Q34 112 36 126" stroke="#c8845a" strokeWidth="11" strokeLinecap="round"/>
          <path d="M108 105 Q126 112 122 126" stroke="#c8845a" strokeWidth="11" strokeLinecap="round"/>
          <rect x="28" y="112" width="26" height="32" rx="5" fill="white" stroke="#dae5e4" strokeWidth="1.5"/>
          <line x1="33" y1="120" x2="49" y2="120" stroke="#6f7979" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="33" y1="126" x2="49" y2="126" stroke="#6f7979" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="33" y1="132" x2="44" y2="132" stroke="#6f7979" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="33" y1="138" x2="42" y2="138" stroke="#fdc265" strokeWidth="1.5" strokeLinecap="round"/>
          <rect x="72" y="78" width="16" height="18" rx="6" fill="#c8845a"/>
          <ellipse cx="80" cy="64" rx="26" ry="27" fill="#c8845a"/>
          <path d="M54 58 Q54 30 80 28 Q106 30 106 58 Q106 44 98 40 Q88 34 80 34 Q72 34 62 40 Q54 44 54 58Z" fill="#3d2b1f"/>
          <path d="M54 60 Q50 80 56 88 Q54 78 56 68Z" fill="#3d2b1f"/>
          <path d="M106 60 Q110 80 104 88 Q106 78 104 68Z" fill="#3d2b1f"/>
          <rect x="60" y="62" width="18" height="11" rx="5" stroke="#2d3748" strokeWidth="2.2" fill="white" fillOpacity="0.35"/>
          <rect x="82" y="62" width="18" height="11" rx="5" stroke="#2d3748" strokeWidth="2.2" fill="white" fillOpacity="0.35"/>
          <line x1="78" y1="67" x2="82" y2="67" stroke="#2d3748" strokeWidth="1.8"/>
          <line x1="57" y1="67" x2="60" y2="67" stroke="#2d3748" strokeWidth="1.8"/>
          <line x1="100" y1="67" x2="103" y2="67" stroke="#2d3748" strokeWidth="1.8"/>
          <circle cx="69" cy="68" r="3" fill="#3d2b1f"/>
          <circle cx="91" cy="68" r="3" fill="#3d2b1f"/>
          <circle cx="70.5" cy="67" r="1" fill="white"/>
          <circle cx="92.5" cy="67" r="1" fill="white"/>
          <path d="M73 78 Q80 84 87 78" stroke="#a0522d" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <circle cx="54" cy="72" r="3" fill="#fdc265"/>
          <circle cx="106" cy="72" r="3" fill="#fdc265"/>
        </svg>
      </div>

      {/* Prompt */}
      <p className="px-6 text-lg font-bold text-on-background mb-4">
        Choose the language familiar to you.
      </p>

      {/* Language options */}
      <div className="px-6 flex flex-col gap-3 mb-6">
        {options.map(({ code, label, abbr, iconBg, iconText }) => {
          const active = selected === code
          return (
            <button
              key={code}
              onClick={() => setSelected(code)}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all pressable text-left ${
                active
                  ? 'border-primary bg-primary-fixed'
                  : 'border-outline-variant bg-surface-container-low'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'bg-primary' : iconBg}`}>
                <span className={`text-sm font-black tracking-wide ${active ? 'text-primary-fixed' : iconText}`}>{abbr}</span>
              </div>
              <span className={`font-semibold text-base flex-1 ${active ? 'text-primary' : 'text-on-background'}`}>
                {label}
              </span>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                active ? 'border-primary bg-primary' : 'border-outline-variant'
              }`}>
                {active && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* CTA */}
      <div className="px-6 pb-10">
        <button
          onClick={() => selected && onChoose(selected)}
          className={`w-full py-4 rounded-full font-bold text-base transition-all ${
            selected
              ? 'bg-primary text-on-primary active:opacity-80'
              : 'bg-surface-container text-outline cursor-default'
          }`}
        >
          {selected
            ? (selected === 'es' ? '¡Vamos a empezar!' : "Let's get started!")
            : 'Please select a language'}
        </button>
      </div>
    </div>
  )
}

// ─── SCREEN 1: Onboarding ─────────────────────────────────────────────────────
function OnboardingScreen({ onChoose, onViewDocs }) {
  const [lang, setLang] = useState('es')
  const content = {
    headline: { en: 'Understand your documents without fear.', es: 'Entiende tus documentos sin miedo.' },
    sub:      { en: 'Claro explains medical, legal, and government letters in simple words.', es: 'Claro explica cartas médicas, legales y del gobierno en palabras simples.' },
    bullets:  [
      { en: 'No need to speak perfect English', es: 'No necesitas hablar inglés perfecto' },
      { en: 'Easy and clear explanations',       es: 'Explicaciones fáciles y claras' },
      { en: 'Your documents are private',        es: 'Tus documentos son privados' },
    ],
    cta1: { en: 'Take a Photo', es: 'Tomar Foto' },
    cta2: { en: 'Upload from gallery', es: 'Subir desde galería' },
    cta3: { en: 'View my past documents', es: 'Ver mis documentos anteriores' },
  }
  return (
    <div className="screen bg-surface-container-lowest flex flex-col">
      <StatusBar />
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-primary tracking-tight">claro</span>
          <span className="logo-sun" />
        </div>
        {/* Language toggle */}
        <div className="flex items-center rounded-full border border-outline-variant overflow-hidden text-xs font-bold">
          {['en', 'es'].map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 transition-colors ${lang === l ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Illustration */}
      <div className="flex items-center justify-center py-2 px-8">
        <div className="relative w-52 h-48 flex items-center justify-center">
          {/* Background blob */}
          <div className="absolute inset-0 rounded-3xl bg-primary-fixed opacity-50" />
          {/* Lightbulb badge top-right */}
          <div className="absolute -top-2 -right-2 w-11 h-11 rounded-full bg-secondary-container shadow-md flex items-center justify-center z-10">
            <Icon name="lightbulb" fill={1} size={22} className="text-secondary" />
          </div>
          {/* Woman SVG illustration */}
          <svg viewBox="0 0 160 148" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative w-44 h-40">
            {/* Body / torso */}
            <ellipse cx="80" cy="130" rx="38" ry="22" fill="#0c5252" opacity="0.15"/>
            <rect x="52" y="94" width="56" height="42" rx="14" fill="#0c5252"/>
            {/* Collar */}
            <path d="M72 94 Q80 104 88 94" stroke="#b1eeed" strokeWidth="2" fill="none"/>
            {/* Arms */}
            <path d="M52 105 Q34 112 36 126" stroke="#c8845a" strokeWidth="11" strokeLinecap="round"/>
            <path d="M108 105 Q126 112 122 126" stroke="#c8845a" strokeWidth="11" strokeLinecap="round"/>
            {/* Hands holding document */}
            <rect x="28" y="112" width="26" height="32" rx="5" fill="white" stroke="#dae5e4" strokeWidth="1.5"/>
            <line x1="33" y1="120" x2="49" y2="120" stroke="#6f7979" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="33" y1="126" x2="49" y2="126" stroke="#6f7979" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="33" y1="132" x2="44" y2="132" stroke="#6f7979" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="33" y1="138" x2="42" y2="138" stroke="#fdc265" strokeWidth="1.5" strokeLinecap="round"/>
            {/* Neck */}
            <rect x="72" y="78" width="16" height="18" rx="6" fill="#c8845a"/>
            {/* Head */}
            <ellipse cx="80" cy="64" rx="26" ry="27" fill="#c8845a"/>
            {/* Hair */}
            <path d="M54 58 Q54 30 80 28 Q106 30 106 58 Q106 44 98 40 Q88 34 80 34 Q72 34 62 40 Q54 44 54 58Z" fill="#3d2b1f"/>
            <path d="M54 60 Q50 80 56 88 Q54 78 56 68Z" fill="#3d2b1f"/>
            <path d="M106 60 Q110 80 104 88 Q106 78 104 68Z" fill="#3d2b1f"/>
            {/* Glasses frames */}
            <rect x="60" y="62" width="18" height="11" rx="5" stroke="#2d3748" strokeWidth="2.2" fill="white" fillOpacity="0.35"/>
            <rect x="82" y="62" width="18" height="11" rx="5" stroke="#2d3748" strokeWidth="2.2" fill="white" fillOpacity="0.35"/>
            <line x1="78" y1="67" x2="82" y2="67" stroke="#2d3748" strokeWidth="1.8"/>
            <line x1="57" y1="67" x2="60" y2="67" stroke="#2d3748" strokeWidth="1.8"/>
            <line x1="100" y1="67" x2="103" y2="67" stroke="#2d3748" strokeWidth="1.8"/>
            {/* Eyes behind glasses */}
            <circle cx="69" cy="68" r="3" fill="#3d2b1f"/>
            <circle cx="91" cy="68" r="3" fill="#3d2b1f"/>
            <circle cx="70.5" cy="67" r="1" fill="white"/>
            <circle cx="92.5" cy="67" r="1" fill="white"/>
            {/* Smile */}
            <path d="M73 78 Q80 84 87 78" stroke="#a0522d" strokeWidth="2" strokeLinecap="round" fill="none"/>
            {/* Earrings */}
            <circle cx="54" cy="72" r="3" fill="#fdc265"/>
            <circle cx="106" cy="72" r="3" fill="#fdc265"/>
          </svg>
        </div>
      </div>

      {/* Headline */}
      <div className="px-6 mb-4">
        <h1 className="text-2xl font-bold text-on-background leading-tight mb-2">
          {t(content.headline, lang)}
        </h1>
        <p className="text-base text-on-surface-variant leading-relaxed">
          {t(content.sub, lang)}
        </p>
      </div>

      {/* Bullets */}
      <div className="px-6 flex flex-col gap-2 mb-5">
        {content.bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
              <Icon name="check" size={14} className="text-primary" />
            </div>
            <span className="text-sm text-on-surface-variant font-medium">{t(b, lang)}</span>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="px-6 flex flex-col gap-3 pb-8">
        <button
          onClick={() => onChoose(lang)}
          className="flex items-center justify-center gap-2 bg-primary text-on-primary rounded-full py-4 w-full font-bold text-base active:opacity-80 transition-opacity"
        >
          <Icon name="photo_camera" fill={1} size={20} className="text-on-primary" />
          {t(content.cta1, lang)}
        </button>
        <button
          onClick={() => onChoose(lang)}
          className="flex items-center justify-center gap-2 border-2 border-primary text-primary rounded-full py-4 w-full font-bold text-base active:opacity-80 transition-opacity"
        >
          <Icon name="photo_library" fill={0} size={20} className="text-primary" />
          {t(content.cta2, lang)}
        </button>
        <button
          onClick={() => onViewDocs(lang)}
          className="flex items-center justify-center gap-2 text-on-surface-variant py-2 w-full text-sm font-semibold active:opacity-60 transition-opacity"
        >
          <Icon name="folder_open" fill={0} size={18} className="text-on-surface-variant" />
          {t(content.cta3, lang)}
        </button>
      </div>
    </div>
  )
}

// ─── SCREEN 2: Privacy ────────────────────────────────────────────────────────
function PrivacyScreen({ lang, onContinue }) {
  const c = {
    title: { en: 'Your information belongs to you', es: 'Su información le pertenece a usted' },
    items: [
      { icon: 'privacy_tip',       en: 'We do not sell your documents.',                       es: 'No vendemos sus documentos.' },
      { icon: 'manage_accounts',  en: 'You control what is saved.',                           es: 'Usted controla lo que se guarda.' },
      { icon: 'delete_forever',   en: 'You can delete documents at any time.',                es: 'Puede borrar documentos cuando quiera.' },
    ],
    btn: { en: 'Understood', es: 'Entendido' },
  }
  return (
    <div className="screen bg-surface-container-lowest flex flex-col items-center justify-between px-6 py-10">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 w-full animate-fade-up">
        <div className="w-20 h-20 rounded-3xl bg-primary-fixed flex items-center justify-center">
          <Icon name="lock" fill={1} size={40} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-on-background text-center leading-tight">
          {t(c.title, lang)}
        </h2>
        <div className="flex flex-col gap-4 w-full">
          {c.items.map((item, i) => (
            <div key={i} className="flex items-start gap-4 p-4 bg-surface-container-low rounded-2xl">
              <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
                <Icon name={item.icon} fill={1} size={20} className="text-primary" />
              </div>
              <p className="text-base text-on-surface-variant leading-snug pt-1 font-medium">{t(item, lang)}</p>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onContinue}
        className="w-full mt-8 py-4 bg-primary text-on-primary rounded-full font-bold text-base active:opacity-80"
      >
        {t(c.btn, lang)}
      </button>
    </div>
  )
}

// ─── SCREEN 3b: Helper preference (onboarding step) ──────────────────────────
function HelperPreferenceScreen({ lang, onLangChange, onContinue }) {
  const [selected, setSelected] = useState(loadHelperPref() ?? 'not_sure')

  const options = [
    {
      id: 'trusted_person',
      icon: 'people',
      title: { en: 'Someone I trust', es: 'Alguien de mi confianza' },
      desc: {
        en: 'Share with a family member, friend, church member, neighbor, or anyone you already rely on.',
        es: 'Compartir con un familiar, amigo, miembro de la iglesia, vecino, o alguien en quien ya confíe.',
      },
    },
    {
      id: 'community_helper',
      icon: 'volunteer_activism',
      title: { en: 'Community helper', es: 'Ayudante comunitario' },
      desc: {
        en: 'Request help from a trained partner like a library, nonprofit, refugee center, or volunteer navigator when available.',
        es: 'Solicitar ayuda de un socio capacitado como una biblioteca, organización sin fines de lucro, centro para refugiados o navegador voluntario cuando esté disponible.',
      },
    },
    {
      id: 'not_sure',
      icon: 'help_outline',
      title: { en: 'Not sure yet', es: 'No estoy seguro/a aún' },
      desc: {
        en: 'You can choose later when reviewing a document.',
        es: 'Puede elegir más adelante al revisar un documento.',
      },
    },
  ]

  function handleContinue() {
    saveHelperPref(selected)
    onContinue(selected)
  }

  return (
    <div className="screen bg-surface-container-lowest flex flex-col">
      <StatusBar />
      {/* Header with lang toggle */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-primary tracking-tight">claro</span>
          <span className="logo-sun" />
        </div>
        <LangToggle lang={lang} onChange={onLangChange} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-6 flex flex-col gap-5 animate-fade-up">
        {/* Icon */}
        <div className="w-16 h-16 rounded-3xl bg-primary-fixed flex items-center justify-center mx-auto">
          <Icon name="handshake" fill={1} size={32} className="text-primary" />
        </div>

        {/* Headline */}
        <div className="text-center">
          <h2 className="text-xl font-bold text-on-background leading-snug mb-2">
            {lang === 'es'
              ? '¿Quién le gustaría que revisara documentos importantes?'
              : 'For extra confidence, who would you want to double-check important documents?'}
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {lang === 'es'
              ? 'Claro explica documentos en palabras simples. Cuando algo se siente importante, también puede pedirle a alguien de confianza o solicitar ayuda de un ayudante comunitario capacitado.'
              : 'Claro can explain documents in simple language. When something feels important, you can also ask someone you trust or request help from a trained community helper.'}
          </p>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {options.map(opt => {
            const active = selected === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setSelected(opt.id)}
                className={`flex items-start gap-4 p-4 rounded-2xl text-left transition-colors active:opacity-80 ${active ? 'bg-primary-fixed ring-2 ring-primary' : 'bg-surface-container-low'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'bg-primary' : 'bg-surface-container'}`}>
                  <Icon name={opt.icon} fill={active ? 1 : 0} size={20} className={active ? 'text-on-primary' : 'text-on-surface-variant'} />
                </div>
                <div className="flex-1">
                  <p className={`font-bold text-sm leading-snug ${active ? 'text-primary' : 'text-on-background'}`}>
                    {t(opt.title, lang)}
                  </p>
                  <p className={`text-xs mt-1 leading-relaxed ${active ? 'text-on-primary-fixed' : 'text-on-surface-variant'}`}>
                    {t(opt.desc, lang)}
                  </p>
                </div>
                <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors ${active ? 'bg-primary border-primary' : 'border-outline-variant'}`}>
                  {active && <Icon name="check" size={12} className="text-on-primary" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-5 pb-8 pt-2">
        <button
          onClick={handleContinue}
          className="w-full py-4 bg-primary text-on-primary rounded-full font-bold text-base active:opacity-80"
        >
          {lang === 'es' ? 'Continuar' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

// ─── Helper preference ────────────────────────────────────────────────────────
// helper_preference: "trusted_person" | "community_helper" | "not_sure"
const HELPER_KEY = 'claro_helper_v1'
function loadHelperPref() {
  try { return localStorage.getItem(HELPER_KEY) ?? null } catch { return null }
}
function saveHelperPref(v) {
  try { localStorage.setItem(HELPER_KEY, v) } catch {}
}

// ─── Notification settings ────────────────────────────────────────────────────
const NOTIF_KEY = 'claro_notif_v1'

const NOTIF_DEFAULTS = {
  deadlineReminders: true,
  reminderDays: '3',      // '1' | '3' | '7'
  newDocuments: false,
  weeklyDigest: false,
}

function loadNotifPrefs() {
  try { return { ...NOTIF_DEFAULTS, ...JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '{}') } }
  catch { return NOTIF_DEFAULTS }
}

function saveNotifPrefs(prefs) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs)) } catch {}
}

function NotificationSheet({ lang, onClose }) {
  const [prefs, setPrefs] = useState(loadNotifPrefs)

  const es = lang === 'es'

  function toggle(key) {
    setPrefs(p => {
      const next = { ...p, [key]: !p[key] }
      saveNotifPrefs(next)
      return next
    })
  }

  function setDays(val) {
    setPrefs(p => {
      const next = { ...p, reminderDays: val }
      saveNotifPrefs(next)
      return next
    })
  }

  const anyOn = prefs.deadlineReminders || prefs.newDocuments || prefs.weeklyDigest

  return (
    /* Backdrop */
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-black/40 animate-fade-in"
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="bg-surface-container-lowest rounded-t-3xl px-5 pt-4 pb-10 animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center">
              <Icon name="notifications" fill={1} size={20} className="text-primary" />
            </div>
            <div>
              <p className="font-bold text-base text-on-background">
                {es ? 'Notificaciones' : 'Notifications'}
              </p>
              <p className="text-xs text-on-surface-variant">
                {anyOn
                  ? (es ? 'Activadas' : 'Enabled')
                  : (es ? 'Todas desactivadas' : 'All off')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="active:opacity-60">
            <Icon name="close" size={20} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Rows */}
        <div className="bg-surface-container-low rounded-2xl overflow-hidden divide-y divide-outline-variant">

          {/* Deadline reminders toggle */}
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Icon name="calendar_today" fill={1} size={20} className="text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-on-background leading-snug">
                    {es ? 'Recordatorios de fecha límite' : 'Deadline reminders'}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {es ? 'Avísame antes de que venza un plazo' : 'Alert me before a deadline passes'}
                  </p>
                </div>
              </div>
              <Toggle on={prefs.deadlineReminders} onToggle={() => toggle('deadlineReminders')} />
            </div>

            {/* Reminder timing — only shown when enabled */}
            {prefs.deadlineReminders && (
              <div className="mt-3 ml-8 animate-fade-in">
                <p className="text-xs text-on-surface-variant mb-2 font-medium">
                  {es ? 'Recordarme con antelación de:' : 'Remind me ahead by:'}
                </p>
                <div className="flex gap-2">
                  {[
                    { val: '1', en: '1 day',  es: '1 día'    },
                    { val: '3', en: '3 days', es: '3 días'   },
                    { val: '7', en: '1 week', es: '1 semana' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setDays(opt.val)}
                      className={`flex-1 py-2 rounded-full text-xs font-bold border-2 transition-colors pressable ${
                        prefs.reminderDays === opt.val
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {es ? opt.es : opt.en}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* New document saved */}
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Icon name="description" fill={1} size={20} className="text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-on-background leading-snug">
                  {es ? 'Documento guardado' : 'Document saved'}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {es ? 'Confirmar cuando se guarda una explicación' : 'Confirm when an explanation is saved'}
                </p>
              </div>
            </div>
            <Toggle on={prefs.newDocuments} onToggle={() => toggle('newDocuments')} />
          </div>

          {/* Weekly digest */}
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Icon name="view_week" fill={1} size={20} className="text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-on-background leading-snug">
                  {es ? 'Resumen semanal' : 'Weekly digest'}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {es ? 'Lista de documentos pendientes cada semana' : 'List of pending documents each week'}
                </p>
              </div>
            </div>
            <Toggle on={prefs.weeklyDigest} onToggle={() => toggle('weeklyDigest')} />
          </div>
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2 mt-4 px-1">
          <Icon name="info" size={14} className="text-outline flex-shrink-0 mt-0.5" />
          <p className="text-xs text-outline leading-relaxed">
            {es
              ? 'Las notificaciones se envían solo a este dispositivo. No compartimos su información.'
              : 'Notifications are sent to this device only. We never share your information.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// Reusable toggle pill
function Toggle({ on, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors duration-200 pressable ${on ? 'bg-primary' : 'bg-surface-container-high'}`}
      role="switch"
      aria-checked={on}
    >
      <div className={`absolute top-1 w-5 h-5 rounded-full shadow-sm transition-all duration-200 ${on ? 'left-6 bg-on-primary' : 'left-1 bg-outline'}`} />
    </button>
  )
}

// ─── SCREEN 3: Home / Inbox ───────────────────────────────────────────────────
function HomeScreen({ docs, lang, onLangChange, onDocSelect, onNavigate }) {
  const active   = docs.filter(d => !d.done)
  const done     = docs.filter(d =>  d.done)
  const nowDocs  = active.filter(d => d.urgency === 'act-now').sort((a,b) => a.daysLeft - b.daysLeft)
  const soonDocs = active.filter(d => d.urgency === 'act-soon').sort((a,b) => a.daysLeft - b.daysLeft)
  const sortedActive = [...nowDocs, ...soonDocs]

  const [showNotifSheet, setShowNotifSheet] = useState(false)
  const notifPrefs = loadNotifPrefs()
  const anyNotifOn = notifPrefs.deadlineReminders || notifPrefs.newDocuments || notifPrefs.weeklyDigest

  return (
    <div className="screen bg-background flex flex-col">
      {/* Notification settings sheet */}
      {showNotifSheet && (
        <NotificationSheet lang={lang} onClose={() => setShowNotifSheet(false)} />
      )}

      {/* Top bar */}
      <div className="bg-surface-container-lowest sticky top-0 z-10 border-b border-outline-variant">
        <StatusBar />
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-xl font-bold text-on-background">
            {lang === 'es' ? 'Mis documentos' : 'My documents'}
          </h1>
          <div className="flex items-center gap-2">
            <LangToggle lang={lang} onChange={onLangChange} />
            <button
              onClick={() => setShowNotifSheet(true)}
              className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center active:opacity-60 relative"
            >
              <Icon name="notifications" fill={anyNotifOn ? 1 : 0} size={22} className={anyNotifOn ? 'text-primary' : 'text-on-surface-variant'} />
              {anyNotifOn && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary border-2 border-surface-container" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 scroll-y overflow-y-auto pb-24 px-4 pt-4">
        {/* Needs action */}
        {sortedActive.length > 0 && (
          <section className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-on-background">
                {lang === 'es' ? 'Necesita acción' : 'Needs attention'}
              </span>
              <span className="bg-error text-on-error text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {sortedActive.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {sortedActive.map((doc, i) => (
                <div key={doc.id} className="animate-fade-up" style={{ animationDelay: `${i * 0.06}s` }}>
                  <DocumentCard doc={doc} lang={lang} onClick={() => onDocSelect(doc)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {done.length > 0 && (
          <section className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-on-background">
                {lang === 'es' ? 'Completados' : 'Completed'}
              </span>
              <span className="bg-primary-fixed text-primary text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {done.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {done.map(doc => (
                <div key={doc.id} className="opacity-70">
                  <DocumentCard doc={{ ...doc, done: true }} lang={lang} onClick={() => onDocSelect(doc)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty */}
        {sortedActive.length === 0 && done.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4 animate-fade-up">
            <div className="w-16 h-16 rounded-full bg-primary-fixed flex items-center justify-center">
              <Icon name="check_circle" fill={1} size={32} className="text-primary" />
            </div>
            <p className="text-lg font-bold text-on-background">
              {lang === 'es' ? '¡Todo en orden!' : 'All clear!'}
            </p>
            <p className="text-sm text-on-surface-variant">
              {lang === 'es' ? 'Escanea un documento para comenzar.' : 'Scan a document to get started.'}
            </p>
          </div>
        )}
      </div>

      <BottomNav screen="home" onNavigate={onNavigate} lang={lang} />
    </div>
  )
}

// ─── SCREEN 4: Scan / Camera ──────────────────────────────────────────────────
const PROCESS_STAGES = [
  { en: 'Reading your document…',    es: 'Leyendo su documento…',    ms: 1500 },
  { en: 'Identifying what matters…', es: 'Identificando lo importante…', ms: 1700 },
  { en: 'Preparing your summary…',   es: 'Preparando su resumen…',   ms: 1200 },
]

// ─── Double-check section (result + detail screens) ──────────────────────────
function DoubleCheckSection({ lang, helperPref, onShare }) {
  const [communityRequested, setCommunityRequested] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const trustedFirst   = helperPref === 'trusted_person'
  const communityFirst = helperPref === 'community_helper'

  const TrustedBtn = ({ recommended }) => (
    <button
      onClick={onShare}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left active:opacity-70 ${recommended ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}
    >
      <Icon name="people" fill={1} size={20} className={recommended ? 'text-on-primary' : 'text-primary'} />
      <div className="flex-1">
        <p className={`font-semibold text-sm ${recommended ? 'text-on-primary' : 'text-on-background'}`}>
          {lang === 'es' ? 'Pedir a alguien de confianza' : 'Ask someone I trust'}
        </p>
        {recommended && (
          <p className="text-xs text-on-primary/80">{lang === 'es' ? 'Su preferencia' : 'Your preference'}</p>
        )}
      </div>
      <Icon name="share" size={18} className={recommended ? 'text-on-primary/70' : 'text-outline'} />
    </button>
  )

  const CommunityBtn = ({ recommended }) => (
    communityRequested ? null : (
      <button
        onClick={() => setCommunityRequested(true)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left active:opacity-70 ${recommended ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}
      >
        <Icon name="volunteer_activism" fill={1} size={20} className={recommended ? 'text-on-primary' : 'text-secondary'} />
        <div className="flex-1">
          <p className={`font-semibold text-sm ${recommended ? 'text-on-primary' : 'text-on-background'}`}>
            {lang === 'es' ? 'Solicitar ayudante comunitario' : 'Request a community helper'}
          </p>
          {recommended && (
            <p className="text-xs text-on-primary/80">{lang === 'es' ? 'Su preferencia' : 'Your preference'}</p>
          )}
        </div>
        <Icon name="chevron_right" size={18} className={recommended ? 'text-on-primary/70' : 'text-outline'} />
      </button>
    )
  )

  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-outline-variant">
      {/* Header */}
      <div className="bg-surface-container-lowest px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="verified_user" fill={1} size={16} className="text-primary" />
          <p className="text-xs font-bold text-primary uppercase tracking-wider">
            {lang === 'es' ? '¿Quiere que alguien confirme esto?' : 'Want someone to double-check this?'}
          </p>
        </div>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {lang === 'es'
            ? 'Claro funciona mejor cuando alguien de confianza o un ayudante comunitario capacitado puede confirmar la explicación.'
            : 'Claro works even better when someone you trust or a trained community helper can confirm the explanation.'}
        </p>
      </div>

      {/* MVP placeholder when community request submitted */}
      {communityRequested ? (
        <div className="bg-secondary-container px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Icon name="schedule" size={16} className="text-secondary" />
            <p className="text-sm font-semibold text-secondary">
              {lang === 'es' ? 'Solicitud anotada' : 'Request noted'}
            </p>
          </div>
          <p className="text-xs text-on-secondary-container leading-relaxed mb-3">
            {lang === 'es'
              ? 'Las solicitudes de ayudante comunitario estarán disponibles pronto. Por ahora, puede compartir esta explicación con alguien de confianza.'
              : 'Community helper requests are coming soon. For now, you can share this explanation with someone you trust.'}
          </p>
          <button
            onClick={onShare}
            className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary rounded-full py-2.5 text-sm font-semibold active:opacity-80"
          >
            <Icon name="share" size={16} className="text-on-primary" />
            {lang === 'es' ? 'Compartir explicación' : 'Share explanation'}
          </button>
        </div>
      ) : (
        <div className="bg-surface-container-lowest px-4 pb-4 flex flex-col gap-2">
          {communityFirst ? (
            <><CommunityBtn recommended /><TrustedBtn /></>
          ) : trustedFirst ? (
            <><TrustedBtn recommended /><CommunityBtn /></>
          ) : (
            <><TrustedBtn /><CommunityBtn /></>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-on-surface-variant py-1 text-center active:opacity-60"
          >
            {lang === 'es' ? 'Ahora no' : 'Not now'}
          </button>
        </div>
      )}
    </div>
  )
}

function ScanScreen({ lang, onProcessingDone, onUncertain, onBack, existingDoc = null }) {
  // phase: idle | flash | reviewing | processing | error
  const [phase,      setPhase]      = useState('idle')
  const [stageIdx,   setStageIdx]   = useState(0)
  const [doneStages, setDoneStages] = useState([])
  const [captured,   setCaptured]   = useState(null) // dataURL
  const [errorMsg,   setErrorMsg]   = useState('')
  const [hasCamera,  setHasCamera]  = useState(false)

  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const fileRef     = useRef(null)
  const streamRef   = useRef(null)
  const timers      = useRef([])
  const apiResult   = useRef(null) // holds the resolved doc from API

  // ── Start live camera ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) return
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        setHasCamera(true)
      } catch {
        // Permission denied or no camera — fall back to file picker
        setHasCamera(false)
      }
    }
    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // ── Cleanup timers ─────────────────────────────────────────────────────────
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // ── Capture frame from video ───────────────────────────────────────────────
  function captureFrame() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    canvas.width  = video.videoWidth  || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d').drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  // ── Shutter pressed ────────────────────────────────────────────────────────
  function handleShutter() {
    if (hasCamera && streamRef.current) {
      setPhase('flash')
      timers.current.push(setTimeout(() => {
        const dataUrl = captureFrame()
        if (dataUrl) {
          setCaptured(dataUrl)
          setPhase('reviewing')
        } else {
          setPhase('idle')
        }
      }, 150))
    } else {
      // No live camera — trigger file picker
      fileRef.current?.click()
    }
  }

  // ── File selected from gallery / file picker ───────────────────────────────
  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setCaptured(ev.target.result)
      setPhase('reviewing')
    }
    reader.readAsDataURL(file)
    // Reset so the same file can be selected again after retake
    e.target.value = ''
  }

  // ── Process the captured image via Claude API ──────────────────────────────
  async function processImage(dataUrl) {
    setPhase('processing')
    setStageIdx(0)
    setDoneStages([])
    apiResult.current = null

    // Drive the stage animation independently of the API call
    let stageTimer = null
    function advanceStage(idx) {
      if (idx >= PROCESS_STAGES.length) return
      setStageIdx(idx)
      stageTimer = setTimeout(() => {
        setDoneStages(p => [...p, idx])
        advanceStage(idx + 1)
      }, PROCESS_STAGES[idx].ms)
    }
    advanceStage(0)

    try {
      const doc = await analyzeDocument(dataUrl, existingDoc)
      apiResult.current = doc

      // Wait for the animation to finish all stages before calling done
      const totalMs = PROCESS_STAGES.reduce((s, st) => s + st.ms, 0) + 400
      const elapsed = 0 // animation started simultaneously; just ensure minimum
      timers.current.push(setTimeout(() => {
        clearTimeout(stageTimer)
        setDoneStages(PROCESS_STAGES.map((_, i) => i))
        timers.current.push(setTimeout(() => {
          onProcessingDone(apiResult.current)
        }, 350))
      }, Math.max(0, totalMs - elapsed)))
    } catch (err) {
      clearTimeout(stageTimer)
      if (err.message === 'UNREADABLE') {
        onUncertain()
      } else if (err.message === 'MISSING_API_KEY') {
        setErrorMsg(
          lang === 'es'
            ? 'Falta la clave API. Configúrela en .env.local'
            : 'API key missing. Set VITE_ANTHROPIC_API_KEY in .env.local'
        )
        setPhase('error')
      } else {
        setErrorMsg(err.message?.slice(0, 120) ?? 'Unknown error')
        setPhase('error')
      }
    }
  }

  // ── Processing view ────────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <div className="screen bg-background flex flex-col items-center justify-center px-8 gap-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-primary-fixed flex items-center justify-center">
            <Icon name="description" fill={1} size={48} className="text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 bg-secondary-container rounded-full p-1.5">
            <Icon name="auto_awesome" fill={1} size={18} className="text-secondary" />
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-on-background mb-1">
            {lang === 'es' ? 'Estamos leyendo su documento…' : 'Reading your document…'}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {lang === 'es' ? 'Esto puede tomar unos segundos.' : 'This may take a few seconds.'}
          </p>
        </div>

        <div className="w-full space-y-2.5">
          {PROCESS_STAGES.map((stage, i) => {
            const done    = doneStages.includes(i)
            const current = stageIdx === i && !done
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-400 ${done ? 'bg-primary-fixed' : current ? 'bg-surface-container' : 'bg-surface-container-low'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${done ? 'bg-primary' : current ? 'bg-primary-container' : 'bg-outline-variant'}`}>
                  {done    && <Icon name="check" size={14} className="text-on-primary" />}
                  {current && <Icon name="refresh" size={14} className="text-on-primary animate-spin-slow" />}
                </div>
                <span className={`text-sm font-medium transition-colors ${done ? 'text-primary' : current ? 'text-on-background' : 'text-outline'}`}>
                  {t(stage, lang)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce-dot1" />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce-dot2" />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce-dot3" />
        </div>

        <div className="flex items-center gap-2 mt-4 px-4 py-2.5 bg-surface-container-low rounded-full">
          <Icon name="lock" fill={1} size={14} className="text-primary" />
          <span className="text-xs text-on-surface-variant font-medium">
            {lang === 'es' ? 'Sus documentos son privados y seguros.' : 'Your documents are private and secure.'}
          </span>
        </div>
      </div>
    )
  }

  // ── Photo review view ──────────────────────────────────────────────────────
  if (phase === 'reviewing' && captured) {
    return (
      <div className="screen bg-slate-900 flex flex-col">
        <div className="flex items-center justify-between px-4 pt-10 pb-3">
          <button onClick={() => { setCaptured(null); setPhase('idle') }}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:opacity-60">
            <Icon name="close" size={20} className="text-white" />
          </button>
          <span className="text-white font-semibold text-sm">
            {lang === 'es' ? 'Confirmar foto' : 'Confirm photo'}
          </span>
          <div className="w-10" />
        </div>

        {/* Captured image preview */}
        <div className="flex-1 flex items-center justify-center overflow-hidden px-4">
          <img
            src={captured}
            alt="Captured document"
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
          />
        </div>

        {/* Action buttons */}
        <div className="px-6 pt-5 pb-8 flex gap-4">
          <button
            onClick={() => { setCaptured(null); setPhase('idle') }}
            className="flex-1 py-3.5 rounded-full border border-white/30 text-white font-semibold text-sm active:opacity-60">
            {lang === 'es' ? 'Tomar otra' : 'Retake'}
          </button>
          <button
            onClick={() => processImage(captured)}
            className="flex-1 py-3.5 rounded-full bg-primary text-on-primary font-semibold text-sm active:opacity-80 flex items-center justify-center gap-2">
            <Icon name="auto_awesome" fill={1} size={18} className="text-on-primary" />
            {lang === 'es' ? 'Analizar' : 'Analyze'}
          </button>
        </div>
      </div>
    )
  }

  // ── Error view ─────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="screen bg-background flex flex-col items-center justify-center px-8 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-error-container flex items-center justify-center">
          <Icon name="error_outline" size={40} className="text-error" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-on-background mb-2">
            {lang === 'es' ? 'Algo salió mal' : 'Something went wrong'}
          </h2>
          <p className="text-sm text-on-surface-variant">{errorMsg}</p>
        </div>
        <button
          onClick={() => { setPhase('idle'); setCaptured(null); setErrorMsg('') }}
          className="px-8 py-3 rounded-full bg-primary text-on-primary font-semibold text-sm active:opacity-80">
          {lang === 'es' ? 'Intentar de nuevo' : 'Try again'}
        </button>
        <button onClick={onBack} className="text-sm text-on-surface-variant underline">
          {lang === 'es' ? 'Cancelar' : 'Cancel'}
        </button>
      </div>
    )
  }

  // ── Camera / idle view ─────────────────────────────────────────────────────
  return (
    <div className={`screen flex flex-col transition-all duration-150 ${phase === 'flash' ? 'bg-white' : 'bg-slate-900'}`}>
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input fallback */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileSelect}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-10 pb-3 bg-slate-900/90">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:opacity-60">
          <Icon name="close" size={20} className="text-white" />
        </button>
        <span className="text-white font-semibold text-sm">
          {lang === 'es' ? 'Tome una foto del documento' : 'Take a photo of the document'}
        </span>
        <div className="w-10" />
      </div>

      {/* Sub-instruction */}
      <div className="bg-slate-900/90 text-center pb-4">
        <p className="text-white/70 text-sm">
          {lang === 'es' ? 'Asegúrese que todo el papel salga en la foto.' : 'Make sure the full page is visible.'}
        </p>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden">
        {/* Live video stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${hasCamera ? '' : 'hidden'}`}
        />

        {/* Overlay frame guides */}
        <div className="relative z-10 w-64 h-80">
          <div className="vf-corner vf-tl" />
          <div className="vf-corner vf-tr" />
          <div className="vf-corner vf-bl" />
          <div className="vf-corner vf-br" />
          <div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan-line top-1/2" />
        </div>

        {/* No-camera placeholder */}
        {!hasCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60 text-sm">
            <Icon name="photo_camera_back" size={48} className="text-white/30" />
            <p className="text-center px-8">
              {lang === 'es' ? 'Cámara no disponible — use el botón de galería' : 'Camera unavailable — use the gallery button'}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 px-6 pt-5 pb-8 flex items-center justify-between">
        {/* Gallery / file picker */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-1 active:opacity-60">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
            <Icon name="photo_library" size={22} className="text-white" />
          </div>
          <span className="text-[10px] text-white/60 font-medium">
            {lang === 'es' ? 'Galería' : 'Gallery'}
          </span>
        </button>

        {/* Shutter */}
        <button
          onClick={handleShutter}
          className="relative w-20 h-20 rounded-full active:scale-95 transition-transform">
          <div className="absolute inset-0 rounded-full ring-4 ring-white/40" />
          <div className="absolute inset-2 rounded-full bg-white shadow-lg" />
        </button>

        {/* Torch placeholder (visual only) */}
        <button className="flex flex-col items-center gap-1 active:opacity-60">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
            <Icon name="flashlight_on" size={22} className="text-white" />
          </div>
          <span className="text-[10px] text-white/60 font-medium">
            {lang === 'es' ? 'Luz' : 'Flash'}
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── SCREEN 5: Result (post-scan) ─────────────────────────────────────────────
function ResultScreen({ doc, lang, onLangChange, helperPref, onSave, onShare }) {
  const cat = CATEGORY_CONFIG[doc.category] ?? CATEGORY_CONFIG.government
  const urg = URGENCY_CONFIG[doc.urgency] ?? URGENCY_CONFIG['act-soon']
  const urgText = lang === 'es'
    ? (doc.urgency === 'act-now' ? `Atención en ${doc.daysLeft} días` : `Actuar en ${doc.daysLeft} días`)
    : (doc.urgency === 'act-now' ? `Act within ${doc.daysLeft} days` : `Act within ${doc.daysLeft} days`)

  return (
    <div className="screen bg-background flex flex-col">
      <div className="bg-surface-container-lowest border-b border-outline-variant">
        <StatusBar />
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold text-sm text-on-surface-variant">
            {lang === 'es' ? 'Análisis completo' : 'Full analysis'}
          </span>
          <div className="flex items-center gap-2">
            <LangToggle lang={lang} onChange={onLangChange} />
            <button onClick={onShare} className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-60">
              <Icon name="share" size={20} className="text-on-surface-variant" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 scroll-y overflow-y-auto pb-28">
        {/* Doc type badge */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${cat.bg}`}>
              <Icon name={doc.icon} fill={1} size={24} className={cat.fg} />
            </div>
            <div>
              <p className="font-bold text-lg text-on-background leading-tight">{t(doc.title, lang)}</p>
              <p className="text-sm text-on-surface-variant">{doc.issuer}</p>
            </div>
          </div>

          {/* Urgency bar */}
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${urg.bgCls}`}>
            <Icon name="schedule" fill={1} size={22} className={urg.textCls} />
            <span className={`font-bold text-sm ${urg.textCls}`}>{urgText}</span>
          </div>
        </div>

        {/* What this means */}
        <div className="px-5 mb-4">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
            {lang === 'es' ? '¿Qué significa esto?' : 'What does this mean?'}
          </p>
          <p className="text-base text-on-background leading-relaxed">{t(doc.summary, lang)}</p>
        </div>

        {/* What to do */}
        <div className="px-5 mb-4">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
            {lang === 'es' ? 'Qué puede hacer ahora' : 'What you can do now'}
          </p>
          <div className="flex flex-col gap-3">
            {doc.steps.map((step, i) => (
              <div key={step.id} className="flex gap-3 items-start">
                <div className="w-7 h-7 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-on-background">{t(step.title, lang)}</p>
                  <p className="text-sm text-on-surface-variant mt-0.5 leading-relaxed">{t(step.detail, lang)}</p>
                  {step.phone && (
                    <a
                      href={`tel:${step.phone.replace(/[^\d+]/g, '')}`}
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 mt-2 bg-primary-fixed px-3 py-1.5 rounded-full active:opacity-70"
                    >
                      <Icon name="phone" size={13} className="text-primary" />
                      <span className="text-sm font-semibold text-primary">{step.phone}</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hidden paths */}
        <div className="px-5 mb-5">
          <div className="bg-primary-fixed rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="lightbulb" fill={1} size={18} className="text-primary" />
              <p className="text-xs font-bold text-primary uppercase tracking-wider">
                {lang === 'es' ? 'Opciones que quizás no sabía' : 'Options you may not know about'}
              </p>
            </div>
            <ul className="space-y-1.5">
              {doc.hiddenPaths.map((hp, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="text-primary mt-1">•</span>
                  <span className="text-sm text-on-primary-fixed leading-relaxed">{t(hp, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Double-check section */}
        <DoubleCheckSection lang={lang} helperPref={helperPref} onShare={onShare} />
      </div>

      {/* Action buttons */}
      <div className="absolute bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant px-5 py-4 flex gap-3">
        <button
          onClick={onShare}
          className="flex-1 flex items-center justify-center gap-2 border-2 border-outline-variant text-on-surface-variant rounded-full py-3.5 font-semibold text-sm active:opacity-70"
        >
          <Icon name="share" size={18} className="text-on-surface-variant" />
          {lang === 'es' ? 'Compartir' : 'Share'}
        </button>
        <button
          onClick={onSave}
          className="flex-1 bg-primary text-on-primary rounded-full py-3.5 font-bold text-sm active:opacity-80 flex items-center justify-center gap-2"
        >
          <Icon name="bookmark_add" size={18} className="text-on-primary" />
          {lang === 'es' ? 'Guardar' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── SCREEN 6: Document detail ────────────────────────────────────────────────
function DetailScreen({ doc, lang, onLangChange, helperPref, onBack, onStepToggle, onArchive, onShare }) {
  const urg = doc.done ? URGENCY_CONFIG.done : (URGENCY_CONFIG[doc.urgency] ?? URGENCY_CONFIG['act-soon'])
  const allDone = doc.steps.every(s => s.done)

  return (
    <div className="screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant">
        <StatusBar />
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="active:opacity-60 mr-1">
              <Icon name="arrow_back" size={22} className="text-on-background" />
            </button>
            <div>
              <p className="font-bold text-sm text-on-background leading-tight">{t(doc.title, lang)}</p>
              <p className="text-xs text-on-surface-variant">
                {lang === 'es' ? 'Recibido: ' : 'Received: '}{t(doc.receivedDate, lang)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle lang={lang} onChange={onLangChange} />
          </div>
        </div>
      </div>

      <div className="flex-1 scroll-y overflow-y-auto pb-24">
        {/* Urgency bar */}
        {!doc.done && (
          <div className={`flex items-center gap-3 mx-4 mt-4 rounded-xl px-4 py-3 ${urg.bgCls}`}>
            <Icon name="warning" fill={1} size={20} className={urg.textCls} />
            <div>
              <span className={`font-bold text-sm ${urg.textCls}`}>
                {lang === 'es' ? 'Atención en ' : 'Attention in '}{doc.daysLeft}{lang === 'es' ? ' días' : ' days'}
              </span>
              <span className={`text-xs ml-2 ${urg.textCls} opacity-80`}>
                {t(doc.deadlineLabel, lang)}
              </span>
            </div>
          </div>
        )}
        {doc.done && (
          <div className="flex items-center gap-3 mx-4 mt-4 rounded-xl px-4 py-3 bg-primary-fixed">
            <Icon name="check_circle" fill={1} size={20} className="text-primary" />
            <span className="font-bold text-sm text-primary">
              {lang === 'es' ? 'Completado' : 'Completed'}
            </span>
          </div>
        )}

        {/* Key info chips — always visible (account number, amounts, dates) */}
        {doc.keyInfo && doc.keyInfo.length > 0 && (
          <div className="mx-4 mt-4 flex flex-wrap gap-2">
            {doc.keyInfo.map((info, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-surface-container px-3 py-1.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="text-xs font-medium text-on-surface-variant">{t(info, lang)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Accordion sections */}
        <div className="mt-4 bg-surface-container-lowest rounded-2xl mx-4 overflow-hidden shadow-sm">
          <Accordion icon="summarize" title={lang === 'es' ? 'Resumen' : 'Summary'} defaultOpen>
            <p className="text-sm text-on-surface-variant leading-relaxed">{t(doc.summary, lang)}</p>
          </Accordion>

          <Accordion icon="checklist" title={lang === 'es' ? 'Qué puede hacer ahora' : 'What you can do now'} defaultOpen={!doc.done}>
            <div className="flex flex-col gap-3">
              {doc.steps.map((step, i) => (
                <StepItem key={step.id} step={step} index={i} lang={lang} onToggle={onStepToggle} />
              ))}
            </div>
            {allDone && !doc.done && (
              <button
                onClick={onArchive}
                className="w-full mt-4 py-3 bg-primary text-on-primary rounded-full font-bold text-sm active:opacity-80 animate-fade-up"
              >
                {lang === 'es' ? 'Marcar como resuelto' : 'Mark as resolved'}
              </button>
            )}
          </Accordion>

          <Accordion icon="lightbulb" title={lang === 'es' ? 'Opciones que quizás no sabía' : 'Options you may not know about'}>
            <ul className="space-y-2">
              {doc.hiddenPaths.map((hp, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <span className="text-sm text-on-surface-variant leading-relaxed">{t(hp, lang)}</span>
                </li>
              ))}
            </ul>
          </Accordion>

          <Accordion icon="info" title={lang === 'es' ? 'Información importante' : 'Key information'}>
            <div className="space-y-2.5">
              {doc.keyInfo.map((info, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  <span className="text-sm text-on-surface-variant">{t(info, lang)}</span>
                </div>
              ))}
            </div>
          </Accordion>
        </div>

        {/* Double-check section */}
        <div className="mt-4">
          <DoubleCheckSection lang={lang} helperPref={helperPref} onShare={onShare} />
        </div>

        {/* Share / Delete */}
        <div className="flex gap-3 mx-4 mt-2 mb-2">
          <button onClick={onShare} className="flex-1 flex items-center justify-center gap-2 border border-outline-variant rounded-full py-3 text-on-surface-variant text-sm font-semibold active:opacity-60">
            <Icon name="share" size={16} className="text-on-surface-variant" />
            {lang === 'es' ? 'Compartir' : 'Share'}
          </button>
          <button onClick={onArchive} className="flex-1 flex items-center justify-center gap-2 border border-error-container rounded-full py-3 text-error text-sm font-semibold active:opacity-60">
            <Icon name="delete" size={16} className="text-error" />
            {lang === 'es' ? 'Eliminar' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pre-scan choice sheet ────────────────────────────────────────────────────
function PreScanSheet({ lastDoc, lang, onNew, onAddPage, onClose }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-surface-container-lowest rounded-t-3xl px-5 pt-4 pb-10 animate-fade-up">
        <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-5" />
        <h2 className="text-lg font-bold text-on-background mb-1">
          {lang === 'es' ? '¿Qué desea escanear?' : 'What would you like to scan?'}
        </h2>
        <p className="text-sm text-on-surface-variant mb-5">
          {lang === 'es' ? 'Agregue una página a un documento existente o empiece uno nuevo.' : 'Add a page to an existing document or start a new one.'}
        </p>

        {/* Add page to last doc */}
        <button
          onClick={onAddPage}
          className="w-full flex items-center gap-4 bg-surface-container p-4 rounded-2xl mb-3 text-left active:opacity-70"
        >
          <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center flex-shrink-0">
            <Icon name="add_photo_alternate" size={22} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-on-background text-sm">{lang === 'es' ? 'Agregar página a' : 'Add page to'}</p>
            <p className="text-sm text-primary font-medium truncate">{t(lastDoc.title, lang)}</p>
          </div>
          <Icon name="chevron_right" size={20} className="text-outline flex-shrink-0" />
        </button>

        {/* New document */}
        <button
          onClick={onNew}
          className="w-full flex items-center gap-4 bg-surface-container p-4 rounded-2xl text-left active:opacity-70"
        >
          <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0">
            <Icon name="note_add" size={22} className="text-on-secondary-container" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-on-background text-sm">{lang === 'es' ? 'Nuevo documento' : 'New document'}</p>
            <p className="text-sm text-on-surface-variant">{lang === 'es' ? 'Escanear un documento diferente' : 'Scan a different document'}</p>
          </div>
          <Icon name="chevron_right" size={20} className="text-outline flex-shrink-0" />
        </button>
      </div>
    </div>
  )
}

// ─── Page summary (between scan and full result) ───────────────────────────────
// Mock for what a second page might reveal
const PAGE_TWO_EXTRA = {
  newInfo: {
    en: 'Page 2 contained a payment ledger showing charges Jan–Apr 2026.',
    es: 'La página 2 contiene un registro de pagos de enero–abril de 2026.',
  },
  newStep: {
    en: 'Request a certified copy of the ledger for your records.',
    es: 'Solicite una copia certificada del registro para sus archivos.',
  },
}

function PageSummaryScreen({ doc, lang, pageCount, onAddPage, onFinalize }) {
  const cat = CATEGORY_CONFIG[doc.category] ?? CATEGORY_CONFIG.government

  return (
    <div className="screen bg-background flex flex-col">
      <div className="bg-surface-container-lowest border-b border-outline-variant">
        <StatusBar />
        <div className="px-5 py-3">
          {/* Page dots */}
          <div className="flex items-center gap-2 mb-1">
            <div className="flex gap-1">
              {Array.from({ length: pageCount }).map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-primary" />
              ))}
            </div>
            <span className="text-xs font-semibold text-primary">
              {lang === 'es' ? `Página ${pageCount} escaneada` : `Page ${pageCount} scanned`}
            </span>
          </div>
          <h2 className="font-bold text-base text-on-background leading-tight">{t(doc.title, lang)}</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">{doc.issuer}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-36 px-5 pt-5">
        {/* New info highlight (page 2+) */}
        {pageCount > 1 && (
          <div className="mb-4 bg-secondary-container rounded-2xl p-4 animate-fade-up">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="auto_awesome" fill={1} size={18} className="text-secondary" />
              <p className="text-xs font-bold text-secondary uppercase tracking-wider">
                {lang === 'es' ? 'Nueva información encontrada' : 'New information found'}
              </p>
            </div>
            <p className="text-sm text-on-secondary-container leading-relaxed">{t(PAGE_TWO_EXTRA.newInfo, lang)}</p>
            <div className="mt-3 pt-3 border-t border-secondary/20">
              <p className="text-xs font-semibold text-secondary mb-1">
                {lang === 'es' ? '+ 1 paso adicional identificado:' : '+ 1 additional step identified:'}
              </p>
              <p className="text-sm text-on-secondary-container">{t(PAGE_TWO_EXTRA.newStep, lang)}</p>
            </div>
          </div>
        )}

        {/* Category & urgency */}
        <div className="flex items-center gap-3 mb-4 bg-surface-container rounded-2xl px-4 py-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${cat.bg}`}>
            <Icon name={doc.icon} fill={1} size={22} className={cat.fg} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Icon name="schedule" size={15} className="text-error" />
              <span className="text-sm font-semibold text-error">
                {lang === 'es' ? `Acción en ${doc.daysLeft} días` : `Action needed in ${doc.daysLeft} days`}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">{t(doc.deadlineLabel, lang)}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-4">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
            {lang === 'es' ? 'Resumen de esta página' : 'Page summary'}
          </p>
          <p className="text-base text-on-background leading-relaxed">{t(doc.summary, lang)}</p>
        </div>

        <div className="flex items-start gap-2 bg-surface-container-low rounded-xl p-3">
          <Icon name="info" size={16} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {lang === 'es'
              ? 'Los pasos detallados y opciones completas aparecerán una vez que finalice el documento.'
              : 'Detailed steps and full options will appear once you finalize the document.'}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant px-5 py-4 flex flex-col gap-3">
        <button
          onClick={onFinalize}
          className="w-full bg-primary text-on-primary rounded-full py-3.5 font-bold text-sm flex items-center justify-center gap-2 active:opacity-80"
        >
          <Icon name="check_circle" size={18} className="text-on-primary" />
          {lang === 'es' ? 'Finalizar documento' : 'Finalize document'}
        </button>
        <button
          onClick={onAddPage}
          className="w-full border-2 border-outline-variant text-on-surface-variant rounded-full py-3.5 font-semibold text-sm flex items-center justify-center gap-2 active:opacity-70"
        >
          <Icon name="add_photo_alternate" size={18} className="text-on-surface-variant" />
          {lang === 'es' ? 'Agregar otra página' : 'Add another page'}
        </button>
      </div>
    </div>
  )
}

// ─── Calendar screen ──────────────────────────────────────────────────────────
function CalendarScreen({ docs, lang, onLangChange, onDocSelect, onNavigate }) {
  const today = useMemo(() => new Date(), [])
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [activeDay, setActiveDay] = useState(null)

  const deadlineMap = useMemo(() => {
    const map = {}
    docs.filter(d => !d.done && d.daysLeft != null).forEach(doc => {
      const dl = new Date(today)
      dl.setDate(today.getDate() + doc.daysLeft)
      const key = `${dl.getFullYear()}-${dl.getMonth()}-${dl.getDate()}`
      ;(map[key] = map[key] ?? []).push(doc)
    })
    return map
  }, [docs, today])

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate()
  const monthLabel      = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'long', year: 'numeric' })

  const activeDocs = activeDay
    ? (deadlineMap[`${viewYear}-${viewMonth}-${activeDay}`] ?? [])
    : []

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
    setActiveDay(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
    setActiveDay(null)
  }

  const dayHeaders = lang === 'es'
    ? ['D','L','M','X','J','V','S']
    : ['Su','Mo','Tu','We','Th','Fr','Sa']

  const upcomingDocs = useMemo(() =>
    docs.filter(d => !d.done).sort((a, b) => a.daysLeft - b.daysLeft),
  [docs])

  return (
    <div className="screen bg-background flex flex-col">
      <div className="bg-surface-container-lowest border-b border-outline-variant">
        <StatusBar />
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-xl font-bold text-on-background">
            {lang === 'es' ? 'Calendario' : 'Calendar'}
          </h1>
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* Month navigation */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <button onClick={prevMonth} className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center active:opacity-60">
            <Icon name="chevron_left" size={22} className="text-on-surface-variant" />
          </button>
          <span className="font-semibold text-base text-on-background capitalize">{monthLabel}</span>
          <button onClick={nextMonth} className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center active:opacity-60">
            <Icon name="chevron_right" size={22} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-3 mb-1">
          {dayHeaders.map((d, i) => (
            <div key={i} className="h-8 flex items-center justify-center">
              <span className="text-xs font-semibold text-on-surface-variant">{d}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 px-3 gap-y-1">
          {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day     = i + 1
            const key     = `${viewYear}-${viewMonth}-${day}`
            const dayDocs = deadlineMap[key] ?? []
            const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
            const isActive = activeDay === day
            const urgency  = dayDocs.some(d => d.urgency === 'act-now') ? 'now' : dayDocs.length > 0 ? 'soon' : null

            return (
              <button
                key={day}
                onClick={() => setActiveDay(isActive ? null : day)}
                className={`relative h-10 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors active:opacity-70
                  ${isActive ? 'bg-primary' : isToday ? 'bg-primary-fixed' : ''}`}
              >
                <span className={`text-sm font-semibold leading-none
                  ${isActive ? 'text-on-primary' : isToday ? 'text-primary' : 'text-on-background'}`}>
                  {day}
                </span>
                {urgency && (
                  <div className={`w-1.5 h-1.5 rounded-full
                    ${isActive ? 'bg-on-primary/70' : urgency === 'now' ? 'bg-error' : 'bg-secondary'}`}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-5 mt-3 mb-5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-error" />
            <span className="text-xs text-on-surface-variant">{lang === 'es' ? 'Urgente' : 'Urgent'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-xs text-on-surface-variant">{lang === 'es' ? 'Próximo' : 'Upcoming'}</span>
          </div>
        </div>

        {/* Active day detail */}
        {activeDay !== null && (
          <div className="px-4 animate-fade-up">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">
              {new Date(viewYear, viewMonth, activeDay)
                .toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
              {activeDocs.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                  <Icon name="event_available" size={32} className="text-outline-variant" />
                  <p className="text-sm text-on-surface-variant">
                    {lang === 'es' ? 'Ningún vencimiento este día.' : 'No deadlines on this day.'}
                  </p>
                </div>
              ) : activeDocs.map((doc, i) => (
                <button
                  key={doc.id}
                  onClick={() => onDocSelect(doc)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-container-low ${i > 0 ? 'border-t border-outline-variant' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-primary-fixed'}`}>
                    <Icon name={doc.icon} fill={1} size={18} className={CATEGORY_CONFIG[doc.category]?.fg ?? 'text-primary'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-on-background truncate">{t(doc.title, lang)}</p>
                    <p className={`text-xs font-medium ${doc.urgency === 'act-now' ? 'text-error' : 'text-secondary'}`}>
                      {t(doc.deadlineLabel, lang)}
                    </p>
                  </div>
                  <Icon name="chevron_right" size={18} className="text-outline flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All upcoming (when no day selected) */}
        {activeDay === null && (
          <div className="px-4">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 px-1">
              {lang === 'es' ? 'Próximos vencimientos' : 'Upcoming deadlines'}
            </p>
            <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm">
              {upcomingDocs.length === 0 ? (
                <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                  <Icon name="celebration" fill={1} size={36} className="text-primary" />
                  <p className="text-sm text-on-surface-variant">
                    {lang === 'es' ? '¡Sin vencimientos pendientes!' : 'No upcoming deadlines!'}
                  </p>
                </div>
              ) : upcomingDocs.map((doc, i) => {
                const dl = new Date(today)
                dl.setDate(today.getDate() + doc.daysLeft)
                const dateStr = dl.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })
                const urg = URGENCY_CONFIG[doc.urgency] ?? URGENCY_CONFIG['act-soon']
                return (
                  <button
                    key={doc.id}
                    onClick={() => onDocSelect(doc)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-surface-container-low ${i > 0 ? 'border-t border-outline-variant' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${CATEGORY_CONFIG[doc.category]?.bg ?? 'bg-primary-fixed'}`}>
                      <Icon name={doc.icon} fill={1} size={18} className={CATEGORY_CONFIG[doc.category]?.fg ?? 'text-primary'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-on-background truncate">{t(doc.title, lang)}</p>
                      <p className={`text-xs font-medium ${urg.textCls}`}>{t(doc.deadlineLabel, lang)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-xs font-bold text-on-surface-variant">{dateStr}</p>
                      <p className="text-[10px] text-outline">{doc.daysLeft}d</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <BottomNav screen="calendar" onNavigate={onNavigate} lang={lang} />
    </div>
  )
}

// ─── SCREEN 7: Uncertain ──────────────────────────────────────────────────────
function UncertainScreen({ lang, onRetake, onContinue }) {
  return (
    <div className="screen bg-background flex flex-col items-center justify-between px-6 py-10">
      <div />
      <div className="flex flex-col items-center gap-6 text-center animate-fade-up">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-secondary-container opacity-30" />
          <Icon name="help" fill={0} size={64} className="text-secondary relative" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-on-background leading-tight mb-3">
            {lang === 'es' ? 'No estamos completamente seguros.' : 'We\'re not completely sure.'}
          </h2>
          <p className="text-base text-on-surface-variant leading-relaxed">
            {lang === 'es'
              ? 'La foto está borrosa o este documento es difícil de leer. Una foto más clara nos ayudará a darte mejor información.'
              : 'The photo is blurry or this document is hard to read. A clearer photo will help us give you better information.'}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={onRetake}
            className="flex items-center justify-center gap-2 bg-primary text-on-primary rounded-full py-4 w-full font-bold active:opacity-80"
          >
            <Icon name="photo_camera" fill={1} size={20} className="text-on-primary" />
            {lang === 'es' ? 'Tomar otra foto' : 'Take another photo'}
          </button>
          <button
            onClick={onContinue}
            className="py-4 w-full font-semibold text-on-surface-variant text-sm active:opacity-60"
          >
            {lang === 'es' ? 'Continuar de todas formas' : 'Continue anyway'}
          </button>
        </div>
        <div className="flex items-start gap-2 bg-surface-container-low rounded-xl p-3 text-left">
          <Icon name="info" size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {lang === 'es'
              ? 'Nunca adivinamos cuando no estamos seguros.'
              : 'We never guess when we\'re not sure.'}
          </p>
        </div>
      </div>
      <div />
    </div>
  )
}

// ─── SCREEN 8: Archive / Settings ─────────────────────────────────────────────
function ArchiveScreen({ docs, lang, onDocSelect, onNavigate, onLangChange }) {
  const archived = docs.filter(d => d.done)
  return (
    <div className="screen bg-background flex flex-col">
      <div className="bg-surface-container-lowest border-b border-outline-variant">
        <StatusBar />
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-xl font-bold text-on-background">{lang === 'es' ? 'Ajustes' : 'Settings'}</h1>
          <LangToggle lang={lang} onChange={onLangChange} />
        </div>
      </div>

      <div className="flex-1 scroll-y overflow-y-auto pb-24 px-4 pt-4 space-y-4">
        {/* Language */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
            {lang === 'es' ? 'Idioma' : 'Language'}
          </p>
          <div className="flex gap-3">
            {[{code:'en',label:'English'},{code:'es',label:'Español'}].map(({ code, label }) => (
              <button
                key={code}
                onClick={() => onLangChange(code)}
                className={`flex-1 py-3 rounded-full font-bold text-sm transition-colors ${lang === code ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Archived docs */}
        {archived.length > 0 && (
          <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
              {lang === 'es' ? 'Documentos completados' : 'Completed documents'}
            </p>
            <div className="space-y-2">
              {archived.map(doc => (
                <DocumentCard key={doc.id} doc={{ ...doc, done: true }} lang={lang} onClick={() => onDocSelect(doc)} />
              ))}
            </div>
          </div>
        )}

        {/* Privacy */}
        <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
            {lang === 'es' ? 'Privacidad' : 'Privacy'}
          </p>
          {[
            { icon: 'privacy_tip',    en: 'We do not sell your documents.',     es: 'No vendemos sus documentos.' },
            { icon: 'manage_accounts',en: 'You control what is saved.',          es: 'Usted controla lo que se guarda.' },
            { icon: 'delete_forever', en: 'Delete all documents at any time.',   es: 'Borre todos los documentos en cualquier momento.' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-outline-variant last:border-0">
              <Icon name={item.icon} fill={1} size={20} className="text-primary" />
              <span className="text-sm text-on-surface-variant font-medium">{t(item, lang)}</span>
            </div>
          ))}
        </div>
      </div>

      <BottomNav screen="archive" onNavigate={onNavigate} lang={lang} />
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const LANG_KEY = 'claro_lang'

export default function App() {
  const savedLang = localStorage.getItem(LANG_KEY)
  const [screen,           setScreen]           = useState(savedLang ? 'onboarding' : 'language')
  const [lang,             setLang]             = useState(savedLang ?? 'es')
  const [docs,             setDocs]             = useState(() => loadDocs(INITIAL_DOCS))
  const [selectedDoc,      setSelectedDoc]      = useState(null)
  const [scanAdded,        setScanAdded]        = useState(false)
  const [pageCount,        setPageCount]        = useState(1)
  const [preScanSheetOpen, setPreScanSheetOpen] = useState(false)
  const [scannedDoc,       setScannedDoc]       = useState(null)
  const [helperPref,       setHelperPref]       = useState(() => loadHelperPref())

  const sync = useSyncEngine()

  // Persist docs to localStorage on every change
  useEffect(() => { saveDocs(docs) }, [docs])

  function navigate(to) { setScreen(to); setSelectedDoc(null) }

  // Global lang change (from any screen's toggle)
  function handleLangChange(l) {
    localStorage.setItem(LANG_KEY, l)
    setLang(l)
  }

  function handleLangPicked(l) {
    localStorage.setItem(LANG_KEY, l)
    setLang(l)
    setScreen('onboarding')
  }
  // After privacy screen → go to helper preference step
  function handleLangChosen(l) { setLang(l); setScreen('privacy') }
  function handleViewDocs(l)   { setLang(l); setScreen('home') }

  // Helper preference chosen in onboarding
  function handleHelperChosen(pref) {
    setHelperPref(pref)
    setScreen('home')
  }

  // After processing: show page summary (not the full result yet)
  function handleScanDone(doc) {
    // Assign a stable id and track page count in the doc
    const newDoc = {
      ...doc,
      id:          Date.now(),
      done:        false,
      _pageCount:  pageCount,
    }
    setScannedDoc(newDoc)
    setSelectedDoc(newDoc)
    setScreen('page-summary')
  }

  // User taps "Add another page" on PageSummaryScreen
  function handleAddPage() {
    setPageCount(p => p + 1)
    setScreen('scan')
  }

  // User taps "Finalize document" on PageSummaryScreen → show full analysis
  function finalizeScan() {
    const doc = scannedDoc ?? selectedDoc
    if (!scanAdded && doc) {
      setDocs(prev => [doc, ...prev])
      setScanAdded(true)
      enqueue('SAVE_DOC', { doc })
      sync.bumpQueue()
    }
    setScreen('result')
  }

  function handleSaveDoc() {
    setScreen('home')
    setSelectedDoc(null)
    setPageCount(1)
    setScanAdded(false)
    setScannedDoc(null)
  }

  function handleDocSelect(doc) {
    setSelectedDoc(doc)
    setScreen('detail')
  }

  function handleStepToggle(stepId) {
    setDocs(prev => prev.map(d => {
      if (d.id !== selectedDoc?.id) return d
      const updated = { ...d, steps: d.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s) }
      setSelectedDoc(updated)
      return updated
    }))
    enqueue('TOGGLE_STEP', { docId: selectedDoc?.id, stepId })
    sync.bumpQueue()
  }

  function handleArchive() {
    setDocs(prev => prev.map(d => d.id === selectedDoc?.id ? { ...d, done: true } : d))
    enqueue('MARK_DONE', { docId: selectedDoc?.id })
    sync.bumpQueue()
    setScreen('home')
    setSelectedDoc(null)
  }

  async function handleShare(docToShare) {
    const d = docToShare ?? selectedDoc
    if (!d) return
    const title   = t(d.title, lang)
    const summary = t(d.summary, lang)
    const steps   = d.steps.map((s, i) => `${i + 1}. ${t(s.title, lang)}${s.phone ? ` — ${s.phone}` : ''}`).join('\n')
    const body    = `📄 ${title}\n\n${summary}\n\n${lang === 'es' ? 'Qué puede hacer:' : 'What you can do:'}\n${steps}\n\n— Claro`
    try {
      if (navigator.share) {
        await navigator.share({ title: `Claro: ${title}`, text: body })
      } else {
        await navigator.clipboard.writeText(body)
      }
    } catch { /* user cancelled */ }
  }

  function handleNavigate(tab) {
    if (tab === 'scan') {
      // If docs exist, ask: new doc or add page to last?
      const activeDocs = docs.filter(d => !d.done)
      if (activeDocs.length > 0) { setPreScanSheetOpen(true); return }
      setPageCount(1); setScanAdded(false); setScannedDoc(null); setScreen('scan'); return
    }
    if (tab === 'home')     { navigate('home'); return }
    if (tab === 'calendar') { navigate('calendar'); return }
    if (tab === 'archive')  { navigate('archive'); return }
  }

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768

  const appContent = (
    <div className="relative w-full h-full overflow-hidden bg-background">
      {/* Dynamic island stub on desktop */}
      {isDesktop && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-b-2xl z-50" />
      )}

      {/* Sync status — floats over all screens, only visible when needed */}
      <div className="absolute top-0 left-0 right-0 z-[60] pointer-events-none">
        <SyncBanner
          online={sync.online}
          syncing={sync.syncing}
          queueLen={sync.queueLen}
          lastSynced={sync.lastSynced}
          lang={lang}
        />
      </div>

      {screen === 'language'     && <LanguageScreen onChoose={handleLangPicked} />}
      {screen === 'onboarding'   && <OnboardingScreen onChoose={handleLangChosen} onViewDocs={handleViewDocs} />}
      {screen === 'privacy'      && <PrivacyScreen lang={lang} onContinue={() => setScreen('helper')} />}
      {screen === 'helper'       && (
        <HelperPreferenceScreen
          lang={lang}
          onLangChange={handleLangChange}
          onContinue={handleHelperChosen}
        />
      )}
      {screen === 'home'         && (
        <HomeScreen
          docs={docs} lang={lang}
          onLangChange={handleLangChange}
          onDocSelect={handleDocSelect}
          onNavigate={handleNavigate}
        />
      )}
      {screen === 'calendar'     && (
        <CalendarScreen docs={docs} lang={lang} onLangChange={handleLangChange} onDocSelect={handleDocSelect} onNavigate={handleNavigate} />
      )}
      {screen === 'scan'         && <ScanScreen lang={lang} onProcessingDone={handleScanDone} onUncertain={() => setScreen('uncertain')} onBack={() => setScreen(pageCount > 1 ? 'page-summary' : 'home')} existingDoc={pageCount > 1 ? scannedDoc : null} />}
      {screen === 'uncertain'    && <UncertainScreen lang={lang} onRetake={() => setScreen('scan')} onContinue={finalizeScan} />}
      {screen === 'page-summary' && selectedDoc && (
        <PageSummaryScreen doc={selectedDoc} lang={lang} pageCount={pageCount} onAddPage={handleAddPage} onFinalize={finalizeScan} />
      )}
      {screen === 'result'       && selectedDoc && (
        <ResultScreen
          doc={selectedDoc}
          lang={lang}
          onLangChange={handleLangChange}
          helperPref={helperPref}
          onSave={handleSaveDoc}
          onShare={() => handleShare(selectedDoc)}
        />
      )}
      {screen === 'detail'       && selectedDoc && (
        <DetailScreen
          doc={docs.find(d => d.id === selectedDoc.id) ?? selectedDoc}
          lang={lang}
          onLangChange={handleLangChange}
          helperPref={helperPref}
          onBack={() => setScreen('home')}
          onStepToggle={handleStepToggle}
          onArchive={handleArchive}
          onShare={() => handleShare(docs.find(d => d.id === selectedDoc.id) ?? selectedDoc)}
        />
      )}
      {screen === 'archive'      && (
        <ArchiveScreen docs={docs} lang={lang} onDocSelect={handleDocSelect} onNavigate={handleNavigate} onLangChange={handleLangChange} />
      )}

      {/* Pre-scan choice sheet — overlays current screen */}
      {preScanSheetOpen && (
        <PreScanSheet
          lastDoc={docs.filter(d => !d.done)[0] ?? docs[0]}
          lang={lang}
          onNew={() => { setPreScanSheetOpen(false); setPageCount(1); setScanAdded(false); setScannedDoc(null); setScreen('scan') }}
          onAddPage={() => { setPreScanSheetOpen(false); setPageCount(1); setScreen('scan') }}
          onClose={() => setPreScanSheetOpen(false)}
        />
      )}
    </div>
  )

  if (!isDesktop) {
    return <div className="fixed inset-0">{appContent}</div>
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: 'radial-gradient(ellipse at 35% 60%, #0c3030 0%, #0a0f14 70%)' }}
    >
      <div className="absolute w-80 h-80 rounded-full opacity-20 blur-3xl left-1/4 top-1/3" style={{ background: '#0c5252' }} />
      <div className="phone-shell relative z-10" style={{ width: 390, height: 844 }}>
        {appContent}
      </div>
    </div>
  )
}
