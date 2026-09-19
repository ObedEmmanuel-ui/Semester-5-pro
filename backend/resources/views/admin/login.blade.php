<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in · MproWave Admin</title>
    <link rel="icon" href="{{ asset('images/app-icon.png') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-a: #1B1130; --bg-b: #4A1942; --bg-c: #8C2F4A; --bg-d: #B0632F;
            --card: #1C1720; --input-bg: #332A38; --border: #2E2733;
            --primary: #D98E4A; --primary-light: #F2B673;
            --text-primary: #F5EFE6; --text-secondary: #9C8F99; --text-tertiary: #6B6070;
            --danger: #C1495A; --danger-bg: rgba(193,73,90,0.14);
            --on-accent: #120F14;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0; min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
            background: linear-gradient(135deg, var(--bg-a) 0%, var(--bg-b) 42%, var(--bg-c) 72%, var(--bg-d) 100%);
            font-family: 'Inter', -apple-system, sans-serif;
            color: var(--text-primary);
            padding: 20px;
        }
        .panel { width: 100%; max-width: 380px; }
        .brand-mark {
            width: 52px; height: 52px; border-radius: 14px; margin: 0 auto 18px;
            background: #000000;
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        }
        .brand-mark img { width: 100%; height: 100%; object-fit: cover; }
        h1 { font-size: 21px; text-align: center; margin: 0 0 4px; font-weight: 700; }
        .sub { text-align: center; color: var(--text-secondary); font-size: 13.5px; margin: 0 0 28px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px; box-shadow: 0 24px 60px -20px rgba(0,0,0,0.55); }
        label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        input { width: 100%; background: var(--input-bg); border: 1px solid var(--border); color: var(--text-primary); border-radius: 8px; padding: 11px 12px; font-family: inherit; font-size: 14px; }
        input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
        .field { margin-bottom: 16px; }
        button { width: 100%; padding: 12px; border-radius: 8px; border: none; background: var(--primary); color: var(--on-accent); font-family: inherit; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 6px; }
        button:hover { filter: brightness(1.05); }
        .error-box { background: var(--danger-bg); color: var(--danger); border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 18px; font-weight: 600; }
        .footnote { text-align: center; color: var(--text-tertiary); font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="panel">
        <div class="brand-mark"><img src="{{ asset('images/app-icon.png') }}" alt="MproWave"></div>
        <h1>MproWave Admin</h1>
        <p class="sub">Sign in to manage users and view platform stats.</p>

        <div class="card">
            @if ($errors->any())
                <div class="error-box">{{ $errors->first() }}</div>
            @endif
            <form method="POST" action="{{ route('admin.login.attempt') }}">
                @csrf
                <div class="field">
                    <label for="email">Email</label>
                    <input type="email" id="email" name="email" value="{{ old('email') }}" autocomplete="username" required autofocus>
                </div>
                <div class="field">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" autocomplete="current-password" required>
                </div>
                <button type="submit">Sign in</button>
            </form>
        </div>
        <p class="footnote">Restricted to admin accounts only.</p>
    </div>
</body>
</html>
