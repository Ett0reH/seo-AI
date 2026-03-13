import { Download, Upload, Key, CheckCircle2, Copy } from 'lucide-react';

export function PluginDownload() {
  // Use the shared app URL for the plugin configuration
  const saasUrl = 'https://ais-pre-dg7ol2jaszqkfid4hnnl4x-101505322741.europe-west1.run.app';
  const apiKey = 'sk_live_1234567890abcdef'; // Default test key

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app, we'd show a toast notification here
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">WordPress Plugin</h1>
        <p className="mt-2 text-sm text-slate-600">
          Download and install the client plugin to connect your WordPress sites to the Semantic Layer SaaS.
        </p>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">SaaS AI SEO Client v1.1.1</h2>
            <p className="text-sm text-slate-500 mt-1">Lightweight, secure, and optimized for performance.</p>
          </div>
          <a
            href="/api/download-plugin"
            download
            className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download Plugin (.php)
          </a>
        </div>

        <div className="p-6 sm:p-8">
          <h3 className="text-base font-semibold leading-6 text-slate-900 mb-6">Installation Guide</h3>
          
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100">
                <Upload className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900">1. Upload to WordPress</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Log in to your WordPress admin dashboard. Go to <strong>Plugins &gt; Add New</strong>, click <strong>Upload Plugin</strong>, and upload the downloaded <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">saas-ai-seo.php</code> file. Activate the plugin.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100">
                <Key className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900">2. Configure Connection</h4>
                <p className="mt-1 text-sm text-slate-500 mb-4">
                  Go to <strong>Settings &gt; SaaS AI SEO</strong> in your WordPress menu and paste the following credentials to securely connect your site:
                </p>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">SaaS Endpoint URL</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 bg-slate-50 sm:text-sm font-mono">
                        {saasUrl}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(saasUrl)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Shared Secret / API Key</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 block w-full rounded-md border-0 py-2 px-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 bg-slate-50 sm:text-sm font-mono">
                        {apiKey}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(apiKey)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900">3. Publish and Sync</h4>
                <p className="mt-1 text-sm text-slate-500">
                  You're all set! Every time you publish or update a post, WordPress will automatically send the content to the SaaS. The AI will analyze it and inject the semantic JSON-LD layer back into your site instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
