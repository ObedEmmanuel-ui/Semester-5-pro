<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminAuditLog;

class AuditLogController extends Controller
{
    public function index()
    {
        $logs = AdminAuditLog::with('admin:id,name,email')->latest()->paginate(30);

        return view('admin.audit.index', compact('logs'));
    }
}
