<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'Dashboard') · MproWave Admin</title>
    <link rel="icon" href="{{ asset('images/app-icon.png') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #120F14;
            --surface: #1C1720;
            --surface-alt: #241D2A;
            --input-bg: #332A38;
            --border: #2E2733;
            --primary: #D98E4A;
            --primary-light: #F2B673;
            --primary-dark: #B06F35;
            --danger: #C1495A;
            --danger-bg: rgba(193, 73, 90, 0.14);
            --success: #4FA79A;
            --success-bg: rgba(79, 167, 154, 0.14);
            --text-primary: #F5EFE6;
            --text-secondary: #9C8F99;
            --text-tertiary: #6B6070;
            --on-accent: #120F14;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: var(--bg);
            color: var(--text-primary);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            line-height: 1.5;
        }
        a { color: inherit; text-decoration: none; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }

        .shell { display: flex; min-height: 100vh; }

        .sidebar {
            width: 232px;
            flex: none;
            background: var(--surface);
            border-right: 1px solid var(--border);
            padding: 24px 16px;
            display: flex;
            flex-direction: column;
            position: sticky;
            top: 0;
            height: 100vh;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 8px 24px;
        }
        .brand-mark {
            width: 34px; height: 34px; border-radius: 9px;
            background: #000000;
            display: flex; align-items: center; justify-content: center;
            flex: none;
            overflow: hidden;
        }
        .brand-mark img { width: 100%; height: 100%; object-fit: cover; }
        .brand-text { line-height: 1.25; }
        .brand-text strong { display: block; font-size: 14.5px; font-weight: 700; }
        .brand-text span { display: block; font-size: 11px; color: var(--text-tertiary); letter-spacing: 0.04em; text-transform: uppercase; }

        .nav { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
        .nav a {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 12px; border-radius: 8px;
            color: var(--text-secondary); font-weight: 600; font-size: 13.5px;
            transition: background 0.12s ease, color 0.12s ease;
        }
        .nav a:hover { background: var(--surface-alt); color: var(--text-primary); }
        .nav a.active { background: var(--surface-alt); color: var(--primary-light); }
        .nav svg { width: 17px; height: 17px; flex: none; }

        .sidebar-foot {
            margin-top: auto;
            padding-top: 16px;
            border-top: 1px solid var(--border);
        }
        .admin-chip { display: flex; align-items: center; gap: 10px; padding: 6px 8px 12px; }
        .admin-avatar {
            width: 30px; height: 30px; border-radius: 50%;
            background: var(--surface-alt); color: var(--text-primary);
            display: flex; align-items: center; justify-content: center;
            font-weight: 700; font-size: 12.5px; flex: none;
        }
        .admin-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .admin-email { font-size: 11.5px; color: var(--text-tertiary); }
        .logout-btn {
            width: 100%; text-align: left;
            background: none; border: none; cursor: pointer;
            display: flex; align-items: center; gap: 10px;
            padding: 9px 8px; border-radius: 8px;
            color: var(--text-secondary); font-weight: 600; font-size: 13px;
            font-family: inherit;
        }
        .logout-btn:hover { background: var(--danger-bg); color: var(--danger); }

        .main { flex: 1; min-width: 0; }
        .topbar {
            display: flex; align-items: center; justify-content: space-between;
            padding: 22px 32px; border-bottom: 1px solid var(--border);
        }
        .topbar h1 { font-size: 19px; margin: 0; font-weight: 700; }
        .topbar-sub { color: var(--text-secondary); font-size: 13px; margin-top: 2px; }
        .content { padding: 28px 32px 48px; }

        .flash {
            margin: 20px 32px 0;
            padding: 12px 16px;
            border-radius: 10px;
            background: var(--success-bg);
            color: var(--success);
            font-weight: 600;
            font-size: 13.5px;
        }
        .flash.error { background: var(--danger-bg); color: var(--danger); }

        .btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer;
            font-family: inherit; font-weight: 600; font-size: 13px;
            background: var(--surface-alt); color: var(--text-primary);
        }
        .btn:hover { filter: brightness(1.08); }
        .btn-primary { background: var(--primary); color: var(--on-accent); }
        .btn-danger { background: transparent; color: var(--danger); border: 1px solid rgba(193,73,90,0.4); }
        .btn-danger:hover { background: var(--danger-bg); }
        .btn-ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
        .btn-sm { padding: 6px 12px; font-size: 12px; }

        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 14px;
        }

        input[type=text], input[type=email], input[type=password], input[type=search] {
            width: 100%;
            background: var(--input-bg);
            border: 1px solid var(--border);
            color: var(--text-primary);
            border-radius: 8px;
            padding: 10px 12px;
            font-family: inherit;
            font-size: 13.5px;
        }
        input::placeholder { color: var(--text-tertiary); }
        input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
        label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .field { margin-bottom: 16px; }
        .field-error { color: var(--danger); font-size: 12px; margin-top: 5px; }
        .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }

        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); font-weight: 700; padding: 12px 16px; border-bottom: 1px solid var(--border); }
        td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 13.5px; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--surface-alt); }

        .badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
        .badge-admin { background: rgba(217,142,74,0.16); color: var(--primary-light); }
        .badge-suspended { background: var(--danger-bg); color: var(--danger); }
        .badge-active { background: var(--success-bg); color: var(--success); }

        .avatar-sm { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: var(--text-primary); flex: none; }
        .user-cell { display: flex; align-items: center; gap: 10px; }
        .user-cell .name { font-weight: 600; }
        .user-cell .email { color: var(--text-tertiary); font-size: 12px; }

        .pagination { display: flex; gap: 4px; margin-top: 20px; flex-wrap: wrap; }
        .pagination a, .pagination span { padding: 7px 12px; border-radius: 7px; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
        .pagination a:hover { background: var(--surface-alt); }
        .pagination .active-page { background: var(--primary); color: var(--on-accent); }
        .pagination .disabled { color: var(--text-tertiary); opacity: 0.5; }

        .empty-state { text-align: center; padding: 60px 20px; color: var(--text-tertiary); }
    </style>
    @yield('head')
</head>
<body>
    <div class="shell">
        <aside class="sidebar">
            <div class="brand">
                <div class="brand-mark"><img src="{{ asset('images/app-icon.png') }}" alt="MproWave"></div>
                <div class="brand-text">
                    <strong>MproWave</strong>
                    <span>Admin</span>
                </div>
            </div>

            <nav class="nav">
                <a href="{{ route('admin.dashboard') }}" class="{{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
                    Dashboard
                </a>
                <a href="{{ route('admin.users.index') }}" class="{{ request()->routeIs('admin.users.*') ? 'active' : '' }}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><circle cx="17.5" cy="8.5" r="2.5"/><path d="M15.5 13.5c2.9 0.3 5 2.9 5 6.5"/></svg>
                    Users
                </a>
                <a href="{{ route('admin.announcements.index') }}" class="{{ request()->routeIs('admin.announcements.*') ? 'active' : '' }}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4.5h13l3 3v9l-3 3H4z"/><path d="M9 9.5h7M9 13.5h5"/></svg>
                    Announcements
                </a>
                <a href="{{ route('admin.moderation.index') }}" class="{{ request()->routeIs('admin.moderation.*') ? 'active' : '' }}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 10.5V7a4 4 0 1 1 8 0v3.5"/><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M12 15v2"/></svg>
                    Moderation
                </a>
                @if (auth('web')->user()?->is_super_admin)
                    <a href="{{ route('admin.audit.index') }}" class="{{ request()->routeIs('admin.audit.*') ? 'active' : '' }}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6l1 3H8z"/><path d="M6 6h12l1 15H5z"/><path d="M9.5 11.5h5M9.5 15h5"/></svg>
                        Audit Log
                    </a>
                @endif
            </nav>

            <div class="sidebar-foot">
                @php($admin = auth('web')->user())
                <div class="admin-chip">
                    <div class="admin-avatar">{{ strtoupper(substr($admin->name ?? '?', 0, 1)) }}</div>
                    <div>
                        <div class="admin-name">{{ $admin->name }}</div>
                        <div class="admin-email">{{ $admin->email }}</div>
                    </div>
                </div>
                <form method="POST" action="{{ route('admin.logout') }}">
                    @csrf
                    <button type="submit" class="logout-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
                        Sign out
                    </button>
                </form>
            </div>
        </aside>

        <div class="main">
            <div class="topbar">
                <div>
                    <h1>@yield('title', 'Dashboard')</h1>
                    @hasSection('subtitle')
                        <div class="topbar-sub">@yield('subtitle')</div>
                    @endif
                </div>
                <div>@yield('topbar-actions')</div>
            </div>

            @if (session('status'))
                <div class="flash">{{ session('status') }}</div>
            @endif
            @if ($errors->any())
                <div class="flash error">{{ $errors->first() }}</div>
            @endif

            <div class="content">
                @yield('content')
            </div>
        </div>
    </div>
</body>
</html>
