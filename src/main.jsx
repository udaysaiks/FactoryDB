import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiUrl = (path) => `${API_BASE_URL}${path}`;

async function loadState(token) {
  const response = await fetch(apiUrl('/api/state'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Unable to load factory data');
  }
  return response.json();
}

async function saveState(payload, token) {
  const response = await fetch(apiUrl('/api/state'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Unable to save factory data');
  }

  return response.json();
}

async function submitProductionReport(token, report) {
  const response = await fetch(apiUrl('/api/production/report'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(report),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to record production');
  return result.order;
}

const workers = [
  { id: 'W-001', name: 'Ramesh Kumar', status: 'active', skill: 'Production', machine: 'TF-01', output: '1,420 / 1,600' },
  { id: 'W-002', name: 'Suresh Patil', status: 'break', skill: 'Cutting', machine: 'CT-01', output: '920 / 1,200' },
  { id: 'W-003', name: 'Anita Devi', status: 'idle', skill: 'Production', machine: 'TF-02', output: '0 / 1,400' },
  { id: 'W-004', name: 'Priya Mehta', status: 'active', skill: 'Production', machine: 'TF-04', output: '1,180 / 1,500' },
];

const machines = [
  { id: 'TF-01', label: 'Thermoformer 1', status: 'running', progress: 76, assigned: 'Ramesh Kumar' },
  { id: 'TF-02', label: 'Thermoformer 2', status: 'running', progress: 64, assigned: 'Anita Devi' },
  { id: 'TF-03', label: 'Thermoformer 3', status: 'down', progress: 0, assigned: 'Maintenance' },
  { id: 'TF-04', label: 'Vacuum Former', status: 'idle', progress: 0, assigned: '—' },
  { id: 'CT-01', label: 'Cutting Line 1', status: 'running', progress: 68, assigned: 'Suresh Patil' },
  { id: 'CT-02', label: 'Cutting Line 2', status: 'idle', progress: 0, assigned: '—' },
];

const orders = [
  { id: 'ORD-007', client: 'Client G', product: 'CUMA Bottom PET tray', qty: '15,000', dispatch: '2026-07-01', priority: 'urgent' },
  { id: 'ORD-001', client: 'Client A', product: 'Denso tray', qty: '8,000', dispatch: '2026-07-02', priority: 'high' },
  { id: 'ORD-003', client: 'Client C', product: 'CUMA Bottom PET tray', qty: '5,000', dispatch: '2026-07-04', priority: 'medium' },
  { id: 'ORD-006', client: 'Client F', product: 'Denso tray', qty: '4,000', dispatch: '2026-07-08', priority: 'low' },
];

const inventory = [
  { type: 'PET sheet', qty: '42 rolls', status: 'OK' },
  { type: 'HIPS sheet', qty: '18 rolls', status: 'Watch' },
  { type: 'PP sheet', qty: '4 rolls', status: 'Reorder' },
  { type: 'Cardboard boxes', qty: '820 pcs', status: 'OK' },
];

const adminNavItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orders', label: 'Orders' },
  { id: 'workers', label: 'Workers' },
  { id: 'machines', label: 'Machines' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'planning', label: 'Planning' },
  { id: 'erp', label: 'ERP Sync' },
];

const workerNavItems = [
  { id: 'dashboard', label: 'My Dashboard' },
  { id: 'orders', label: 'Orders' },
];

const statusTone = {
  active: 'badge green',
  idle: 'badge blue',
  break: 'badge amber',
  down: 'badge red',
  running: 'badge green',
  watch: 'badge amber',
  reorder: 'badge red',
};

function normalizeInventory(input) {
  if (Array.isArray(input)) {
    return { raw: input, mould: [], pack: [] };
  }

  return {
    raw: input?.raw || [],
    mould: input?.mould || [],
    pack: input?.pack || [],
  };
}

function normalizeFactoryState(input) {
  const source = input || {};

  return {
    workers: Array.isArray(source.workers) ? source.workers : workers,
    machines: Array.isArray(source.machines) ? source.machines : machines,
    orders: Array.isArray(source.orders) ? source.orders : orders,
    inventory: normalizeInventory(source.inventory || inventory),
    purchaseOrders: Array.isArray(source.purchaseOrders) ? source.purchaseOrders : [],
    dispatchBoard: Array.isArray(source.dispatchBoard) ? source.dispatchBoard : [],
    scanLog: Array.isArray(source.scanLog) ? source.scanLog : [],
    session: source.session || null,
  };
}

function nextWorkflowStatus(currentStatus, statuses) {
  const currentIndex = statuses.indexOf(currentStatus);
  return statuses[Math.min(currentIndex + 1, statuses.length - 1)];
}

function workflowStatusTone(status) {
  if (status === 'Received' || status === 'Delivered' || status === 'In route') return 'badge green';
  if (status === 'In transit' || status === 'Ready') return 'badge amber';
  return 'badge blue';
}

function parseQuantity(value) {
  const quantity = Number(String(value ?? '').replace(/[\s,]/g, ''));
  return Number.isFinite(quantity) ? quantity : 0;
}

function formatQuantity(value) {
  return parseQuantity(value).toLocaleString();
}

function Knob({ label, value, sub }) {
  return (
    <div className="metric-card">
      <label>{label}</label>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function DashboardView({ role, workerName, workersList = workers, machinesList = machines, ordersList = orders }) {
  const activeMachines = machinesList.filter((machine) => machine.status === 'running').length;
  const adminWorkers = workersList.length;

  return (
    <>
      <section className="stats-grid">
        <Knob label={role === 'admin' ? 'Workers on floor' : 'My output'} value={role === 'admin' ? String(adminWorkers) : '1,420'} sub={role === 'admin' ? `${workersList.filter((worker) => worker.status === 'break').length} on break` : 'this shift'} />
        <Knob label={role === 'admin' ? 'Trays produced today' : 'Target progress'} value={role === 'admin' ? '18,420' : '89%'} sub={role === 'admin' ? '9,400 formed · 9,020 cut' : 'TF-01 / line progress'} />
        <Knob label={role === 'admin' ? 'Machines running' : 'Current machine'} value={role === 'admin' ? `${activeMachines} / ${machinesList.length}` : 'TF-01'} sub={role === 'admin' ? `${machinesList.filter((machine) => machine.status === 'idle').length} idle · ${machinesList.filter((machine) => machine.status === 'down').length} down` : workerName || 'Production'} />
        <Knob label={role === 'admin' ? 'Open orders' : 'Next task'} value={role === 'admin' ? String(ordersList.length) : 'ORD-007'} sub={role === 'admin' ? `${ordersList.filter((order) => order.priority === 'urgent' || order.priority === 'high').length} at risk` : 'Urgent dispatch'} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-header">
            <h3>{role === 'admin' ? 'Factory floor' : 'My production view'}</h3>
            <span className="badge green">Live</span>
          </div>
          <div className="machine-grid">
            {machinesList.map((machine) => (
              <div key={machine.id} className={`machine-box ${machine.status}`}>
                <span>{machine.id}</span>
                <small>{machine.label}</small>
                <strong>{machine.status === 'running' ? `${machine.progress}%` : machine.status === 'down' ? 'Down' : 'Idle'}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>{role === 'admin' ? 'Priority orders' : 'Assigned job'}</h3>
          </div>
          <div className="stack-list">
            {(role === 'admin' ? ordersList : ordersList.slice(0, 2)).map((order) => (
              <div key={order.id} className="stack-item">
                <div>
                  <strong>{order.id}</strong>
                  <small>{order.product}</small>
                </div>
                <span className={`priority ${order.priority}`}>{order.priority}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="two-column bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>{role === 'admin' ? 'Worker status' : 'Shift notes'}</h3>
          </div>
          <div className="stack-list">
            {workersList.slice(0, role === 'admin' ? workersList.length : 2).map((worker) => (
              <div key={worker.id} className="worker-row">
                <div>
                  <strong>{role === 'admin' ? worker.name : workerName}</strong>
                  <small>{role === 'admin' ? worker.machine : 'Production line ready'}</small>
                </div>
                <span className={statusTone[worker.status]}>{role === 'admin' ? worker.status : 'Ready'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>{role === 'admin' ? 'Alerts' : 'Supervisor updates'}</h3>
          </div>
          <div className="alert-list">
            <div className="alert danger">{role === 'admin' ? 'Machine TF-03 requires maintenance' : 'Machine TF-03 is under maintenance'}</div>
            <div className="alert warning">{role === 'admin' ? `${ordersList[0]?.id || 'ORD-007'} dispatches in 36 hours` : 'Your target is 1,600 trays today'}</div>
            <div className="alert warning">{role === 'admin' ? 'PET sheet stock below minimum' : 'Follow current SOP checklist'}</div>
          </div>
        </div>
      </section>
    </>
  );
}

function OrdersView({ orders, setOrders, onRecordProduction, canManage }) {
  const [draft, setDraft] = useState({
    client: '',
    product: '',
    qty: '',
    dispatch: '',
    priority: 'medium',
  });
  const [productionDraft, setProductionDraft] = useState({
    orderId: orders[0]?.id || '',
    stage: 'formedQty',
    qty: '',
  });
  const [productionMessage, setProductionMessage] = useState(null);

  const updateDraft = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const submitOrder = () => {
    const targetQty = parseQuantity(draft.qty);
    if (!draft.client.trim() || !draft.product.trim() || targetQty <= 0) {
      return;
    }

    const nextOrder = {
      id: `ORD-${String(Date.now()).slice(-5)}`,
      client: draft.client.trim(),
      product: draft.product.trim(),
      qty: targetQty,
      formedQty: 0,
      cutQty: 0,
      dispatch: draft.dispatch || '2026-07-10',
      priority: draft.priority,
      status: 'active',
    };

    setOrders((prev) => [nextOrder, ...prev]);
    setDraft({ client: '', product: '', qty: '', dispatch: '', priority: 'medium' });
  };

  const recordProduction = async () => {
    const order = orders.find((item) => item.id === productionDraft.orderId);
    const quantity = parseQuantity(productionDraft.qty);
    if (!order || quantity <= 0 || !Number.isInteger(quantity)) {
      setProductionMessage({ type: 'error', text: 'Select an order and enter a whole quantity greater than zero.' });
      return;
    }

    if (order.status === 'completed') {
      setProductionMessage({ type: 'error', text: 'This order is already complete.' });
      return;
    }

    const targetQty = parseQuantity(order.qty);
    const currentQty = parseQuantity(order[productionDraft.stage]);
    const limit = productionDraft.stage === 'formedQty' ? targetQty : parseQuantity(order.formedQty);
    if (currentQty + quantity > limit) {
      const limitLabel = productionDraft.stage === 'formedQty' ? 'order target' : 'formed quantity';
      setProductionMessage({ type: 'error', text: `Reported quantity exceeds the remaining ${limitLabel}.` });
      return;
    }

    try {
      const updatedOrder = await onRecordProduction({
        orderId: order.id,
        stage: productionDraft.stage,
        quantity,
      });
      setOrders((prev) => prev.map((item) => item.id === updatedOrder.id ? updatedOrder : item));
      setProductionMessage({ type: 'success', text: `${quantity.toLocaleString()} units recorded for ${order.id}.` });
      setProductionDraft((prev) => ({ ...prev, qty: '' }));
    } catch (error) {
      setProductionMessage({ type: 'error', text: error.message });
    }
  };

  return (
    <div className="panel full-panel">
      <div className="panel-header">
        <h3>Active orders</h3>
      </div>

      {canManage && <div className="form-panel">
        <div className="form-grid">
          <div className="form-field">
            <label>Client</label>
            <input value={draft.client} onChange={(event) => updateDraft('client', event.target.value)} />
          </div>
          <div className="form-field">
            <label>Product</label>
            <input value={draft.product} onChange={(event) => updateDraft('product', event.target.value)} />
          </div>
          <div className="form-field">
            <label>Qty</label>
            <input type="number" min="1" step="1" value={draft.qty} onChange={(event) => updateDraft('qty', event.target.value)} />
          </div>
          <div className="form-field">
            <label>Dispatch</label>
            <input type="date" value={draft.dispatch} onChange={(event) => updateDraft('dispatch', event.target.value)} />
          </div>
          <div className="form-field">
            <label>Priority</label>
            <select value={draft.priority} onChange={(event) => updateDraft('priority', event.target.value)}>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div className="action-row">
          <button className="primary-btn" onClick={submitOrder}>Create order</button>
        </div>
      </div>}

      <div className="form-panel">
        <div className="panel-header">
          <h3>Record production</h3>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>Order</label>
            <select
              value={productionDraft.orderId}
              onChange={(event) => setProductionDraft((prev) => ({ ...prev, orderId: event.target.value }))}
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>{order.id} · {order.client}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Production stage</label>
            <select
              value={productionDraft.stage}
              onChange={(event) => setProductionDraft((prev) => ({ ...prev, stage: event.target.value }))}
            >
              <option value="formedQty">Forming</option>
              <option value="cutQty">Cutting</option>
            </select>
          </div>
          <div className="form-field">
            <label>Quantity completed</label>
            <input
              type="number"
              min="1"
              step="1"
              value={productionDraft.qty}
              onChange={(event) => setProductionDraft((prev) => ({ ...prev, qty: event.target.value }))}
            />
          </div>
        </div>
        <div className="action-row">
          <button className="primary-btn" onClick={recordProduction}>Record quantity</button>
        </div>
        {productionMessage && (
          <div className={`production-feedback ${productionMessage.type}`} role="status">
            {productionMessage.text}
          </div>
        )}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Client</th>
            <th>Product</th>
            <th>Target</th>
            <th>Formed</th>
            <th>Cut</th>
            <th>Dispatch</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.client}</td>
              <td>{order.product}</td>
              <td>{formatQuantity(order.qty)}</td>
              <td>{formatQuantity(order.formedQty)} / {formatQuantity(order.qty)}</td>
              <td>{formatQuantity(order.cutQty)} / {formatQuantity(order.qty)}</td>
              <td>{order.dispatch}</td>
              <td><span className={`priority ${order.priority}`}>{order.priority}</span></td>
              <td><span className={order.status === 'completed' ? 'badge green' : 'badge blue'}>{order.status || 'active'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkersView({ workers, setWorkers, token }) {
  const [draft, setDraft] = useState({ name: '', skill: 'Production', machine: 'TF-01' });
  const [resetCredentials, setResetCredentials] = useState(null);
  const [pinError, setPinError] = useState('');

  const updateDraft = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const submitWorker = () => {
    if (!draft.name.trim()) {
      return;
    }

    const nextWorker = {
      id: `W-${String(workers.length + 1).padStart(3, '0')}`,
      name: draft.name.trim(),
      status: 'active',
      skill: draft.skill,
      machine: draft.machine,
      output: '0 / 1,600',
    };

    setWorkers((prev) => [nextWorker, ...prev]);
    setDraft({ name: '', skill: 'Production', machine: 'TF-01' });
  };

  const resetWorkerPin = async (workerId) => {
    setPinError('');
    setResetCredentials(null);
    try {
      const response = await fetch(apiUrl(`/api/workers/${encodeURIComponent(workerId)}/reset-pin`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to reset worker PIN.');
      setResetCredentials({ workerId, pin: result.pin });
    } catch (error) {
      setPinError(error.message);
    }
  };

  return (
    <div className="panel full-panel">
      <div className="panel-header">
        <h3>Workers</h3>
      </div>

      <div className="form-panel">
        <div className="form-grid">
          <div className="form-field">
            <label>Name</label>
            <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
          </div>
          <div className="form-field">
            <label>Skill</label>
            <select value={draft.skill} onChange={(event) => updateDraft('skill', event.target.value)}>
              <option value="Production">Production</option>
              <option value="Cutting">Cutting</option>
              <option value="Packing">Packing</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </div>
          <div className="form-field">
            <label>Machine</label>
            <select value={draft.machine} onChange={(event) => updateDraft('machine', event.target.value)}>
              <option value="TF-01">TF-01</option>
              <option value="TF-02">TF-02</option>
              <option value="TF-03">TF-03</option>
              <option value="TF-04">TF-04</option>
              <option value="CT-01">CT-01</option>
              <option value="CT-02">CT-02</option>
            </select>
          </div>
        </div>
        <div className="action-row">
          <button className="primary-btn" onClick={submitWorker}>Add worker</button>
        </div>
        {pinError && <div className="production-feedback error" role="alert">{pinError}</div>}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Skill</th>
            <th>Status</th>
            <th>Machine</th>
            <th>Today</th>
            <th>Access PIN</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => (
            <tr key={worker.id}>
              <td>{worker.name}</td>
              <td>{worker.skill}</td>
              <td><span className={statusTone[worker.status]}>{worker.status}</span></td>
              <td>{worker.machine}</td>
              <td>{worker.output}</td>
              <td>
                {resetCredentials?.workerId === worker.id ? (
                  <div className="planning-row-controls">
                    <strong>{resetCredentials.pin}</strong>
                    <button className="card-action" onClick={() => setResetCredentials(null)}>Hide</button>
                  </div>
                ) : (
                  <button className="card-action" onClick={() => resetWorkerPin(worker.id)}>Reset PIN</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MachinesView({ machines, setMachines }) {
  const [draft, setDraft] = useState({ id: '', label: '', status: 'running' });

  const submitMachine = () => {
    if (!draft.id.trim() || !draft.label.trim()) {
      return;
    }

    const nextMachine = {
      id: draft.id.trim().toUpperCase(),
      label: draft.label.trim(),
      status: draft.status,
      progress: draft.status === 'down' ? 0 : 56,
      assigned: 'Unassigned',
    };

    setMachines((prev) => [nextMachine, ...prev]);
    setDraft({ id: '', label: '', status: 'running' });
  };

  const toggleStatus = (machineId) => {
    setMachines((prev) => prev.map((machine) => {
      if (machine.id !== machineId) return machine;

      if (machine.status === 'running') {
        return { ...machine, status: 'idle', progress: 0 };
      }

      if (machine.status === 'idle') {
        return { ...machine, status: 'running', progress: 62 };
      }

      return { ...machine, status: 'running', progress: 62 };
    }));
  };

  const markDown = (machineId) => {
    setMachines((prev) => prev.map((machine) => (
      machine.id === machineId ? { ...machine, status: 'down', progress: 0 } : machine
    )));
  };

  return (
    <div className="panel full-panel">
      <div className="panel-header">
        <h3>Machine overview</h3>
      </div>

      <div className="form-panel">
        <div className="form-grid">
          <div className="form-field">
            <label>Machine ID</label>
            <input value={draft.id} onChange={(event) => setDraft((prev) => ({ ...prev, id: event.target.value }))} />
          </div>
          <div className="form-field">
            <label>Machine name</label>
            <input value={draft.label} onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))} />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="running">Running</option>
              <option value="idle">Idle</option>
              <option value="down">Down</option>
            </select>
          </div>
        </div>
        <div className="action-row">
          <button className="primary-btn" onClick={submitMachine}>Add machine</button>
        </div>
      </div>

      <div className="card-grid">
        {machines.map((machine) => (
          <div key={machine.id} className="mini-card">
            <div className="mini-card-header">
              <strong>{machine.id}</strong>
              <span className={machine.status === 'down' ? 'badge red' : machine.status === 'running' ? 'badge green' : 'badge blue'}>{machine.status}</span>
            </div>
            <div className="mini-label">{machine.label}</div>
            <div className="progress-bar">
              <span style={{ width: `${machine.progress}%` }} />
            </div>
            <small>{machine.assigned}</small>
            <div className="inline-actions">
              <button className="card-action" onClick={() => toggleStatus(machine.id)}>Toggle</button>
              <button className="card-action warn" onClick={() => markDown(machine.id)}>Down</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryView({ inventory, setInventory }) {
  const [draft, setDraft] = useState({ type: '', qty: '', status: 'OK' });
  const inventoryRows = Array.isArray(inventory?.raw) ? inventory.raw : Array.isArray(inventory) ? inventory : [];

  const submitItem = () => {
    if (!draft.type.trim() || !draft.qty.trim()) {
      return;
    }

    setInventory((prev) => ({
      ...normalizeInventory(prev),
      raw: [{ type: draft.type.trim(), qty: draft.qty.trim(), status: draft.status }, ...((prev && prev.raw) || [])],
    }));
    setDraft({ type: '', qty: '', status: 'OK' });
  };

  return (
    <div className="panel full-panel">
      <div className="panel-header">
        <h3>Inventory</h3>
      </div>

      <div className="form-panel">
        <div className="form-grid">
          <div className="form-field">
            <label>Material</label>
            <input value={draft.type} onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))} />
          </div>
          <div className="form-field">
            <label>Available</label>
            <input value={draft.qty} onChange={(event) => setDraft((prev) => ({ ...prev, qty: event.target.value }))} />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
              <option value="OK">OK</option>
              <option value="Watch">Watch</option>
              <option value="Reorder">Reorder</option>
            </select>
          </div>
        </div>
        <div className="action-row">
          <button className="primary-btn" onClick={submitItem}>Add item</button>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Available</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {inventoryRows.map((item, idx) => (
            <tr key={`${item.type}-${idx}`}>
              <td>{item.type}</td>
              <td>{item.qty}</td>
              <td><span className={item.status === 'OK' ? 'badge green' : item.status === 'Watch' ? 'badge amber' : 'badge red'}>{item.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanningView({ factoryState, setPurchaseOrders, setDispatchBoard }) {
  const [purchaseDraft, setPurchaseDraft] = useState({ item: '', qty: '', vendor: '', eta: '' });
  const [dispatchDraft, setDispatchDraft] = useState({ route: '', truck: '', eta: '', load: '' });
  const purchaseStatuses = ['Queued', 'In transit', 'Received'];
  const dispatchStatuses = ['Planning', 'Ready', 'In route', 'Delivered'];

  const addPurchase = () => {
    if (!purchaseDraft.item.trim() || !purchaseDraft.qty.trim()) return;
    const next = {
      id: `PO-${String(Date.now()).slice(-4)}`,
      item: purchaseDraft.item.trim(),
      qty: purchaseDraft.qty.trim(),
      vendor: purchaseDraft.vendor || 'Local supplier',
      eta: purchaseDraft.eta || '2026-07-10',
      status: 'Queued',
    };
    setPurchaseOrders((prev) => [next, ...prev]);
    setPurchaseDraft({ item: '', qty: '', vendor: '', eta: '' });
  };

  const addDispatch = () => {
    if (!dispatchDraft.route.trim() || !dispatchDraft.truck.trim()) return;
    const next = {
      id: `DSP-${String(Date.now()).slice(-4)}`,
      route: dispatchDraft.route.trim(),
      truck: dispatchDraft.truck.trim(),
      eta: dispatchDraft.eta || '2026-07-10 08:00',
      load: dispatchDraft.load || 'General load',
      status: 'Planning',
    };
    setDispatchBoard((prev) => [next, ...prev]);
    setDispatchDraft({ route: '', truck: '', eta: '', load: '' });
  };

  const advancePurchase = (purchaseId) => {
    setPurchaseOrders((prev) => prev.map((item) => (
      item.id === purchaseId
        ? { ...item, status: nextWorkflowStatus(item.status, purchaseStatuses) }
        : item
    )));
  };

  const advanceDispatch = (dispatchId) => {
    setDispatchBoard((prev) => prev.map((item) => (
      item.id === dispatchId
        ? { ...item, status: nextWorkflowStatus(item.status, dispatchStatuses) }
        : item
    )));
  };

  return (
    <div className="panel full-panel">
      <div className="panel-header">
        <h3>Planning & logistics</h3>
      </div>

      <div className="planning-grid">
        <div className="planning-card">
          <h4>Purchase request</h4>
          <div className="form-grid compact-grid">
            <div className="form-field">
              <label>Item</label>
              <input value={purchaseDraft.item} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, item: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>Qty</label>
              <input value={purchaseDraft.qty} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, qty: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>Vendor</label>
              <input value={purchaseDraft.vendor} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, vendor: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>ETA</label>
              <input type="date" value={purchaseDraft.eta} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, eta: event.target.value }))} />
            </div>
          </div>
          <div className="action-row">
            <button className="primary-btn" onClick={addPurchase}>Add purchase</button>
          </div>
        </div>

        <div className="planning-card">
          <h4>Dispatch plan</h4>
          <div className="form-grid compact-grid">
            <div className="form-field">
              <label>Route</label>
              <input value={dispatchDraft.route} onChange={(event) => setDispatchDraft((prev) => ({ ...prev, route: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>Truck</label>
              <input value={dispatchDraft.truck} onChange={(event) => setDispatchDraft((prev) => ({ ...prev, truck: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>ETA</label>
              <input value={dispatchDraft.eta} onChange={(event) => setDispatchDraft((prev) => ({ ...prev, eta: event.target.value }))} />
            </div>
            <div className="form-field">
              <label>Load</label>
              <input value={dispatchDraft.load} onChange={(event) => setDispatchDraft((prev) => ({ ...prev, load: event.target.value }))} />
            </div>
          </div>
          <div className="action-row">
            <button className="primary-btn" onClick={addDispatch}>Add dispatch</button>
          </div>
        </div>
      </div>

      <div className="erp-summary">
        <div className="erp-card">
          <label>Purchase orders</label>
          <strong>{factoryState.purchaseOrders.length}</strong>
        </div>
        <div className="erp-card">
          <label>Dispatch loads</label>
          <strong>{factoryState.dispatchBoard.length}</strong>
        </div>
        <div className="erp-card">
          <label>Urgent orders</label>
          <strong>{factoryState.orders.filter((order) => order.priority === 'urgent' || order.priority === 'high').length}</strong>
        </div>
        <div className="erp-card">
          <label>Low stock</label>
          <strong>{factoryState.inventory.raw.filter((item) => item.qty <= item.min).length}</strong>
        </div>
      </div>

      <div className="two-column">
        <div className="panel inner-panel">
          <div className="panel-header">
            <h3>Purchase orders</h3>
          </div>
          <div className="stack-list">
            {factoryState.purchaseOrders.map((item) => (
              <div key={item.id} className="stack-item">
                <div>
                  <strong>{item.id}</strong>
                  <small>{item.item} · {item.vendor}</small>
                </div>
                <div className="planning-row-controls">
                  <span className={workflowStatusTone(item.status)}>{item.status}</span>
                  <button
                    className="card-action"
                    onClick={() => advancePurchase(item.id)}
                    disabled={item.status === purchaseStatuses[purchaseStatuses.length - 1]}
                  >
                    {item.status === purchaseStatuses[purchaseStatuses.length - 1] ? 'Complete' : 'Advance'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel inner-panel">
          <div className="panel-header">
            <h3>Dispatch board</h3>
          </div>
          <div className="stack-list">
            {factoryState.dispatchBoard.map((item) => (
              <div key={item.id} className="stack-item">
                <div>
                  <strong>{item.route}</strong>
                  <small>{item.truck} · {item.load}</small>
                </div>
                <div className="planning-row-controls">
                  <span className={workflowStatusTone(item.status)}>{item.status}</span>
                  <button
                    className="card-action"
                    onClick={() => advanceDispatch(item.id)}
                    disabled={item.status === dispatchStatuses[dispatchStatuses.length - 1]}
                  >
                    {item.status === dispatchStatuses[dispatchStatuses.length - 1] ? 'Complete' : 'Advance'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ERPView({ factoryState, token }) {
  const [status, setStatus] = useState('');

  const downloadFile = async (type) => {
    const response = await fetch(apiUrl(`/api/erp/export${type === 'csv' ? '.csv' : ''}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setStatus('Export failed');
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = type === 'csv' ? 'vinpac-erp-orders.csv' : 'vinpac-erp-export.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus(type === 'csv' ? 'CSV export created' : 'JSON export created');
  };

  const syncERP = async () => {
    const response = await fetch(apiUrl('/api/erp/export'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setStatus('ERP sync failed');
      return;
    }

    const payload = await response.json();
    setStatus(`ERP sync queued for ${payload.summary.orders} orders`);
  };

  return (
    <div className="panel full-panel">
      <div className="panel-header">
        <h3>ERP sync</h3>
      </div>

      <div className="erp-summary">
        <div className="erp-card">
          <label>Orders</label>
          <strong>{factoryState.orders.length}</strong>
        </div>
        <div className="erp-card">
          <label>Workers</label>
          <strong>{factoryState.workers.length}</strong>
        </div>
        <div className="erp-card">
          <label>Machines</label>
          <strong>{factoryState.machines.length}</strong>
        </div>
        <div className="erp-card">
          <label>Inventory</label>
          <strong>{(factoryState.inventory.raw || []).length + (factoryState.inventory.mould || []).length + (factoryState.inventory.pack || []).length}</strong>
        </div>
      </div>

      <div className="erp-actions">
        <button className="primary-btn" onClick={() => downloadFile('json')}>Export JSON</button>
        <button className="secondary-btn" onClick={() => downloadFile('csv')}>Export CSV</button>
        <button className="primary-btn" onClick={syncERP}>Sync ERP</button>
      </div>

      {status && <div className="status-banner">{status}</div>}
    </div>
  );
}

function LoginScreen({ onLogin, workersList = [] }) {
  const [mode, setMode] = useState('worker');
  const [selectedWorkerId, setSelectedWorkerId] = useState(workersList[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!workersList.some((worker) => worker.id === selectedWorkerId)) {
      setSelectedWorkerId(workersList[0]?.id ?? '');
    }
  }, [workersList, selectedWorkerId]);

  const submitLogin = async (role) => {
    if (role === 'worker' && !selectedWorkerId) {
      setError('No worker accounts are available.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onLogin({
        role,
        workerId: role === 'worker' ? selectedWorkerId : null,
        pin: role === 'worker' ? pin : adminPin,
      });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="logo">VP</div>
          <div>
            <h1>VINPAC</h1>
            <p>Factory access</p>
          </div>
        </div>

        <div className="switcher">
          <button className={mode === 'worker' ? 'switch active' : 'switch'} onClick={() => setMode('worker')}>Worker</button>
          <button className={mode === 'admin' ? 'switch active' : 'switch'} onClick={() => setMode('admin')}>Admin</button>
        </div>

        {mode === 'worker' ? (
          <>
            <label className="field-label">Select worker</label>
            <div className="worker-list-box">
              {workersList.map((worker) => (
                <button
                  key={worker.id}
                  className={selectedWorkerId === worker.id ? 'worker-option selected' : 'worker-option'}
                  onClick={() => setSelectedWorkerId(worker.id)}
                >
                  <span>{worker.name}</span>
                  <small>{worker.id}</small>
                </button>
              ))}
            </div>

            <label className="field-label">Enter PIN</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              className="pin-input"
            />
            <small className="helper-text">Use the PIN provided by your administrator.</small>
            {error && <div className="error-box">{error}</div>}
            <button className="primary-btn full-btn" onClick={() => submitLogin('worker')} disabled={isSubmitting || !workersList.length}>Continue</button>
          </>
        ) : (
          <>
            <label className="field-label">Admin PIN</label>
            <input
              type="password"
              maxLength={128}
              value={adminPin}
              onChange={(event) => setAdminPin(event.target.value)}
              placeholder="Administrator secret"
              className="pin-input"
            />
            <small className="helper-text">Use the administrator secret configured for this deployment.</small>
            {error && <div className="error-box">{error}</div>}
            <button className="primary-btn full-btn" onClick={() => submitLogin('admin')} disabled={isSubmitting}>Open Dashboard</button>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [session, setSession] = useState(null);
  const [sessionToken, setSessionToken] = useState('');
  const [loginWorkers, setLoginWorkers] = useState([]);
  const [factoryState, setFactoryState] = useState(normalizeFactoryState({
    workers,
    machines,
    orders,
    inventory,
    purchaseOrders: [],
    dispatchBoard: [],
  }));
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let ignore = false;

    fetch(apiUrl('/api/auth/workers'))
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load worker list');
        return response.json();
      })
      .then((items) => {
        if (!ignore) setLoginWorkers(items);
      })
      .catch(() => {
        if (!ignore) setLoginWorkers([]);
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || session?.role !== 'admin' || !sessionToken) return;
    saveState({ ...factoryState, scanLog: [], session: null }, sessionToken).catch(() => {});
  }, [factoryState, isLoaded, session?.role, sessionToken]);

  const onLogin = async (credentials) => {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Login failed.');

    const state = await loadState(result.token);
    setFactoryState(normalizeFactoryState(state));
    setIsLoaded(true);
    setSessionToken(result.token);
    setSession(result.session);
  };

  const recordProduction = async (report) => submitProductionReport(sessionToken, report);

  const workersState = factoryState.workers;
  const machinesState = factoryState.machines;
  const ordersState = factoryState.orders;
  const inventoryState = normalizeInventory(factoryState.inventory);

  const updateFactoryState = (section, updater) => {
    setFactoryState((prev) => ({
      ...prev,
      [section]: typeof updater === 'function' ? updater(prev[section]) : updater,
    }));
  };

  const currentWorker = workersState.find((item) => item.id === session?.workerId) || null;
  const navItems = session?.role === 'admin' ? adminNavItems : workerNavItems;

  const viewMap = useMemo(() => ({
    dashboard: (
      <DashboardView
        role={session?.role || 'worker'}
        workerName={currentWorker?.name || 'Worker'}
        workersList={workersState}
        machinesList={machinesState}
        ordersList={ordersState}
      />
    ),
    orders: (
      <OrdersView
        orders={ordersState}
        setOrders={(updater) => updateFactoryState('orders', updater)}
        onRecordProduction={recordProduction}
        canManage={session?.role === 'admin'}
      />
    ),
    workers: <WorkersView workers={workersState} setWorkers={(updater) => updateFactoryState('workers', updater)} token={sessionToken} />,
    machines: <MachinesView machines={machinesState} setMachines={(updater) => updateFactoryState('machines', updater)} />,
    inventory: <InventoryView inventory={inventoryState} setInventory={(updater) => updateFactoryState('inventory', updater)} />,
    planning: (
      <PlanningView
        factoryState={{
          workers: workersState,
          machines: machinesState,
          orders: ordersState,
          inventory: inventoryState,
          purchaseOrders: factoryState.purchaseOrders,
          dispatchBoard: factoryState.dispatchBoard,
        }}
        setPurchaseOrders={(updater) => updateFactoryState('purchaseOrders', updater)}
        setDispatchBoard={(updater) => updateFactoryState('dispatchBoard', updater)}
      />
    ),
    erp: <ERPView factoryState={{ workers: workersState, machines: machinesState, orders: ordersState, inventory: inventoryState, purchaseOrders: factoryState.purchaseOrders, dispatchBoard: factoryState.dispatchBoard }} token={sessionToken} />,
  }), [session, sessionToken, currentWorker, workersState, machinesState, ordersState, inventoryState, factoryState.purchaseOrders, factoryState.dispatchBoard]);

  if (!session) {
    return <LoginScreen onLogin={onLogin} workersList={loginWorkers} />;
  }

  const onLogout = () => {
    fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    }).catch(() => {});
    setSessionToken('');
    setSession(null);
    setActiveView('dashboard');
    setIsLoaded(false);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="logo">VP</div>
          <div>
            <h1>VINPAC</h1>
            <p>Factory Suite</p>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveView(item.id)}
              disabled={session.role !== 'admin' && item.id === 'workers'}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <label>Logged in as</label>
          <strong>{session.role === 'admin' ? 'Administrator' : currentWorker?.name || 'Worker'}</strong>
          <span>{session.role === 'admin' ? 'Full access' : 'Line access only'}</span>
          <button className="logout-btn" onClick={onLogout}>Switch user</button>
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">Operations overview</p>
            <h2>{session.role === 'admin' ? 'Factory command center' : `${currentWorker?.name || 'Worker'} dashboard`}</h2>
          </div>
          <div className="top-actions">
            <span className="live-pill">● Live</span>
            <button className="secondary-btn">Export</button>
            <button className="primary-btn">{session.role === 'admin' ? 'Admin' : 'Operator'}</button>
          </div>
        </header>

        <main className="content">{viewMap[activeView] || viewMap.dashboard}</main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
