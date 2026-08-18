import { useMemo, useState } from 'react'
import { ArrowUpRight, Download, Search, TrendingUp } from 'lucide-react'
import * as XLSX from 'xlsx'

const ROWS = [
  { region: 'North', owner: 'A. Reyes', pipeline: 184000, won: 96000, deals: 14 },
  { region: 'South', owner: 'M. Cortez', pipeline: 142500, won: 71200, deals: 11 },
  { region: 'East', owner: 'J. Villanueva', pipeline: 219300, won: 133800, deals: 19 },
  { region: 'West', owner: 'K. Domingo', pipeline: 98400, won: 40100, deals: 7 },
  { region: 'Central', owner: 'P. Salazar', pipeline: 167900, won: 88600, deals: 12 },
]

const peso = (n) => '$' + n.toLocaleString('en-US')

function Stat({ label, value, delta }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
        <ArrowUpRight size={14} /> {delta} vs last quarter
      </p>
    </div>
  )
}

export default function SalesDashboard() {
  const [query, setQuery] = useState('')

  const rows = useMemo(
    () => ROWS.filter((r) => (r.region + r.owner).toLowerCase().includes(query.toLowerCase())),
    [query]
  )

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({ pipeline: acc.pipeline + r.pipeline, won: acc.won + r.won, deals: acc.deals + r.deals }),
        { pipeline: 0, won: 0, deals: 0 }
      ),
    [rows]
  )

  const exportXlsx = () => {
    const sheet = XLSX.utils.json_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Pipeline')
    XLSX.writeFile(book, 'pipeline.xlsx')
  }

  return (
    <div className="min-h-screen bg-slate-50 px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Regional pipeline</h1>
            <p className="mt-1 text-sm text-slate-500">Q3 performance across five territories</p>
          </div>
          <button
            onClick={exportXlsx}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Download size={16} /> Export to Excel
          </button>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Open pipeline" value={peso(totals.pipeline)} delta="+12.4%" />
          <Stat label="Closed won" value={peso(totals.won)} delta="+8.1%" />
          <Stat label="Active deals" value={totals.deals} delta="+5" />
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by region or owner"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Region</th>
                <th className="px-5 py-3 font-medium">Owner</th>
                <th className="px-5 py-3 text-right font-medium">Pipeline</th>
                <th className="px-5 py-3 text-right font-medium">Won</th>
                <th className="px-5 py-3 text-right font-medium">Deals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.region} className="transition hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{row.region}</td>
                  <td className="px-5 py-3 text-slate-600">{row.owner}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{peso(row.pipeline)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600">{peso(row.won)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">{row.deals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
