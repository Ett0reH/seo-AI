import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Sites } from './pages/Sites';
import { PagesList } from './pages/PagesList';
import { Entities } from './pages/Entities';
import { Settings } from './pages/Settings';
import { PluginDownload } from './pages/PluginDownload';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sites" element={<Sites />} />
          <Route path="pages" element={<PagesList />} />
          <Route path="entities" element={<Entities />} />
          <Route path="plugin" element={<PluginDownload />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
