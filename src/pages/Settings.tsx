export function Settings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage your API keys, webhooks, and AI model preferences.
        </p>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl">
        <div className="px-4 py-6 sm:p-8">
          <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <label htmlFor="api-key" className="block text-sm font-medium leading-6 text-slate-900">
                SaaS API Key
              </label>
              <div className="mt-2">
                <div className="flex rounded-md shadow-sm ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-600 sm:max-w-md">
                  <input
                    type="password"
                    name="api-key"
                    id="api-key"
                    className="block flex-1 border-0 bg-transparent py-1.5 pl-3 text-slate-900 placeholder:text-slate-400 focus:ring-0 sm:text-sm sm:leading-6"
                    defaultValue="sk_live_1234567890abcdef"
                    readOnly
                  />
                </div>
                <p className="mt-2 text-sm text-slate-500">Use this key in your WordPress plugin settings.</p>
              </div>
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="model" className="block text-sm font-medium leading-6 text-slate-900">
                AI Model Preference
              </label>
              <div className="mt-2">
                <select
                  id="model"
                  name="model"
                  className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
                  defaultValue="gemini-1.5-flash"
                >
                  <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Fastest)</option>
                  <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (Most Accurate)</option>
                  <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-x-6 border-t border-slate-200 px-4 py-4 sm:px-8 bg-slate-50 rounded-b-xl">
          <button type="button" className="text-sm font-semibold leading-6 text-slate-900">
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
