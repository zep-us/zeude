import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  ChartNoAxesCombined,
  ClipboardCheck,
  CloudUpload,
  Rocket,
  Sparkles,
  Wrench,
} from 'lucide-react'
import styles from './page.module.css'

const pillars = [
  {
    title: 'Sensing',
    detail: 'Collect OTEL traces and prompt events from Claude Code usage.',
    icon: ChartNoAxesCombined,
  },
  {
    title: 'Delivery',
    detail: 'Sync skills, MCP servers, and hooks to every engineer machine.',
    icon: CloudUpload,
  },
  {
    title: 'Guidance',
    detail: 'Nudge the right skill at the exact moment a prompt is written.',
    icon: Sparkles,
  },
]

const steps = [
  'Install Zeude shim with one command',
  'Connect your dashboard and team policy',
  'Run Claude as usual and collect telemetry',
  'Share winning prompts and automate best practices',
]

const numbers = [
  { label: 'Sample users', value: '148 (mock)' },
  { label: 'Prompt volume', value: '12.4k/day' },
  { label: 'Skill suggestion CTR', value: '31.2%' },
]
const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const terminalPreview = `[zeude] Initializing... 4 hooks, 23 skills, 1 servers, cached
[zeude] Ready! Hi zeude v1.0.0

 ▐▛███▜▌   Claude Code v2.1.39
▝▜█████▛▘  Sonnet 4.5 · Claude Max
  ▘▘ ▝▝    github.com/zep/zeude`

export const metadata: Metadata = {
  title: 'Zeude Demo',
  description: 'Public demo page for the Zeude adoption platform.',
}

const mockRows = [
  { team: 'Frontend Guild', sessions: 512, acceptanceRate: '33%' },
  { team: 'Platform Core', sessions: 438, acceptanceRate: '29%' },
  { team: 'Data Infra', sessions: 391, acceptanceRate: '35%' },
  { team: 'Security Ops', sessions: 264, acceptanceRate: '27%' },
]

export default function DemoLandingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} />
      <header className={`${styles.nav} ${styles.reveal0}`}>
        <div className={styles.brand}>
          <Image src={`${publicBasePath}/Zep-logo-full.svg`} alt="Zeude" className={styles.logo} width={132} height={32} priority />
          <span className={styles.badge}>Public Demo</span>
        </div>
        <div className={styles.navLinks}>
          <Link href="https://github.com/zep-us/zeude" target="_blank" rel="noreferrer">
            GitHub
          </Link>
          <Link href="/demo">Dashboard</Link>
        </div>
      </header>

      <main className={styles.main}>
        <section className={`${styles.hero} ${styles.reveal1}`}>
          <p className={styles.kicker}>Turn your org into AI natives</p>
          <h1>Zeude makes Claude Code adoption measurable, shareable, and repeatable.</h1>
          <p className={styles.subtitle}>
            Instrument usage, auto-distribute team tooling, and guide engineers with context-aware
            skill nudges. Built for teams that want practical AI leverage, not dashboard vanity.
          </p>
          <p id="mock-note" className={styles.mockNotice}>
            This page uses synthetic mock data only. No production telemetry is queried.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/demo/mock-data.json">
              View Mock JSON
              <ArrowRight size={16} />
            </Link>
            <Link className={styles.secondaryAction} href="/demo">
              Open Mock Dashboard
            </Link>
            <Link className={styles.secondaryAction} href="#mock-note">
              Mock Data Policy
            </Link>
          </div>
        </section>

        <section className={`${styles.metrics} ${styles.reveal2}`}>
          {numbers.map((entry) => (
            <article key={entry.label} className={styles.metricCard}>
              <p>{entry.label}</p>
              <strong>{entry.value}</strong>
            </article>
          ))}
        </section>

        <section className={`${styles.mockPanel} ${styles.reveal3}`}>
          <div className={styles.mockPanelHead}>
            <h2>Mock Team Snapshot</h2>
            <p>Generated: 2026-02-19 (sample dataset)</p>
          </div>
          <div className={styles.mockTable} role="table" aria-label="Mock team summary table">
            <div className={styles.mockRow} role="row">
              <strong role="columnheader">Team</strong>
              <strong role="columnheader">Sessions</strong>
              <strong role="columnheader">Suggestion Acceptance</strong>
            </div>
            {mockRows.map((row) => (
              <div key={row.team} className={styles.mockRow} role="row">
                <span role="cell">{row.team}</span>
                <span role="cell">{row.sessions}</span>
                <span role="cell">{row.acceptanceRate}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.middle} ${styles.reveal3}`}>
          <div className={styles.pillars}>
            {pillars.map((pillar) => {
              const Icon = pillar.icon
              return (
                <article key={pillar.title} className={styles.pillarCard}>
                  <Icon size={18} />
                  <h2>{pillar.title}</h2>
                  <p>{pillar.detail}</p>
                </article>
              )
            })}
          </div>

          <aside className={styles.console}>
            <div className={styles.consoleHead}>
              <span />
              <span />
              <span />
            </div>
            <pre className={styles.consoleText}>{terminalPreview}</pre>
          </aside>
        </section>

        <section className={`${styles.flow} ${styles.reveal4}`}>
          <div className={styles.flowHeader}>
            <h2>Demo Workflow</h2>
            <p>Fast path from install to team-wide behavior change.</p>
          </div>
          <ol>
            {steps.map((step, idx) => (
              <li key={step}>
                <span>{idx + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.cta} ${styles.reveal5}`}>
          <div>
            <h2>Ready to run a pilot?</h2>
            <p>Use this mock demo as a starting point, then connect your own telemetry later.</p>
          </div>
          <div className={styles.ctaButtons}>
            <Link href="/demo">
              <Rocket size={16} />
              Open Mock Dashboard
            </Link>
            <Link href="https://github.com/zep-us/zeude/issues" target="_blank" rel="noreferrer">
              <Wrench size={16} />
              Open Issues
            </Link>
            <Link href="/demo/mock-data.json">
              <ClipboardCheck size={16} />
              Download Mock JSON
            </Link>
            <Link href="/demo">
              <Sparkles size={16} />
              Same UI Demo
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
