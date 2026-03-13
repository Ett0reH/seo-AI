import { useState, useEffect } from 'react';
import { Globe, FileText, Network, Activity } from 'lucide-react';
import { Site, AnalyzedPage, Entity } from '../types';

export function Dashboard() {
  const [statsData, setStatsData] = useState({ sitesCount: 0, pagesCount: 0, entitiesCount: 0 });
  const [sites, setSites] = useState<Site[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const fetchDashboardData = () => {
    Promise.all([
      fetch('/api/stats').then(res => res.json()),
      fetch('/api/sites').then(res => res.json()),
      fetch('/api/entities').then(res => res.json())
    ]).then(([statsRes, sitesRes, entitiesRes]) => {
      setStatsData(statsRes);
      setSites(sitesRes);
      setEntities(entitiesRes.slice(0, 5)); // Top 5
      setLoading(false);
    }).catch(console.error);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const simulateWebhook = async () => {
    setSimulating(true);
    try {
      const payload = {
        siteId: 'example.com',
        postId: Math.floor(Math.random() * 1000),
        postUrl: 'https://example.com/blog/what-is-semantic-seo',
        postTitle: 'What is Semantic SEO and Why It Matters',
        postContent: 'Semantic SEO is the process of building more meaning and topical depth into web content. By doing so, you help Google crawlers better understand your content. It involves using related entities, structured data, and comprehensive topic coverage.',
        wpRestUrl: 'https://example.com/wp-json/saas-ai-seo/v1/update-layer'
      };

      const res = await fetch('/api/webhooks/wp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // We don't send a signature here, the server allows unsigned requests in dev mode
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('Webhook simulated successfully! The AI is analyzing the content in the background. Refresh the page in a few seconds to see the results.');
        setTimeout(fetchDashboardData, 3000);
      } else {
        alert('Failed to simulate webhook.');
      }
    } catch (err) {
      console.error(err);
      alert('Error simulating webhook.');
    } finally {
      setSimulating(false);
    }
  };

  const stats = [
    { name: 'Connected Sites', value: statsData.sitesCount.toString(), icon: Globe, change: '+1', changeType: 'positive' },
    { name: 'Analyzed Pages', value: statsData.pagesCount.toString(), icon: FileText, change: '+12', changeType: 'positive' },
    { name: 'Extracted Entities', value: statsData.entitiesCount.toString(), icon: Network, change: '+45', changeType: 'positive' },
    { name: 'API Requests (24h)', value: '12.4k', icon: Activity, change: '+5.4%', changeType: 'positive' },
  ];

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Overview of your AI Semantic Layer infrastructure.
          </p>
        </div>
        <button
          onClick={simulateWebhook}
          disabled={simulating}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
        >
          {simulating ? 'Simulating...' : 'Simulate Webhook'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <dt>
              <div className="absolute rounded-md bg-indigo-50 p-3">
                <item.icon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-slate-500">{item.name}</p>
            </dt>
            <dd className="ml-16 flex items-baseline pb-1 sm:pb-2">
              <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
              <p
                className={`ml-2 flex items-baseline text-sm font-semibold ${
                  item.changeType === 'positive' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {item.change}
              </p>
            </dd>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Recent Activity / Sync Status */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="text-base font-semibold leading-6 text-slate-900">Recent Sync Activity</h3>
          </div>
          <ul role="list" className="divide-y divide-slate-100">
            {sites.map((site) => (
              <li key={site.id} className="flex items-center justify-between gap-x-6 px-6 py-5">
                <div className="min-w-0">
                  <div className="flex items-start gap-x-3">
                    <p className="text-sm font-semibold leading-6 text-slate-900">{site.name}</p>
                    <p
                      className={`rounded-md whitespace-nowrap mt-0.5 px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        site.status === 'connected'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                          : 'bg-amber-50 text-amber-700 ring-amber-600/20'
                      }`}
                    >
                      {site.status}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-x-2 text-xs leading-5 text-slate-500">
                    <p className="truncate">{site.url}</p>
                    <svg viewBox="0 0 2 2" className="h-0.5 w-0.5 fill-current">
                      <circle cx={1} cy={1} r={1} />
                    </svg>
                    <p>Last sync: {new Date(site.lastSync).toLocaleTimeString()}</p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-x-4">
                  <a
                    href="#"
                    className="hidden rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:block"
                  >
                    View site<span className="sr-only">, {site.name}</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Top Entities */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="text-base font-semibold leading-6 text-slate-900">Top Detected Entities</h3>
          </div>
          <ul role="list" className="divide-y divide-slate-100">
            {entities.map((entity) => (
              <li key={entity.id} className="flex items-center justify-between gap-x-6 px-6 py-5">
                <div className="min-w-0">
                  <div className="flex items-start gap-x-3">
                    <p className="text-sm font-semibold leading-6 text-slate-900">{entity.name}</p>
                    <p className="rounded-md whitespace-nowrap mt-0.5 px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset bg-slate-50 text-slate-600 ring-slate-500/10">
                      {entity.type}
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-x-2 text-xs leading-5 text-slate-500">
                    <p className="truncate">{entity.wikipediaUrl}</p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-x-4">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-semibold text-slate-900">{entity.mentions}</span>
                    <span className="text-xs text-slate-500">mentions</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
