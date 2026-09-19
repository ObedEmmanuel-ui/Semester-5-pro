<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class MakeAdminCommand extends Command
{
    /**
     * Creates a new admin account, or promotes an existing user to admin if
     * the email already exists — the one-time bootstrap for the super admin
     * dashboard, since there's no self-serve way to become an admin.
     */
    protected $signature = 'admin:create {email} {--name=Admin} {--password=}';

    protected $description = 'Create a new admin account, or promote an existing user to admin';

    public function handle(): int
    {
        $email = $this->argument('email');

        $validator = Validator::make(['email' => $email], ['email' => 'required|email']);
        if ($validator->fails()) {
            $this->error($validator->errors()->first('email'));
            return self::FAILURE;
        }

        $user = User::where('email', $email)->first();

        if ($user) {
            $user->update(['is_admin' => true, 'is_suspended' => false]);
            $this->info("Promoted existing user \"{$user->name}\" ({$email}) to admin.");
            return self::SUCCESS;
        }

        $password = $this->option('password') ?: str()->random(16);

        $user = User::create([
            'name' => $this->option('name'),
            'email' => $email,
            'password' => Hash::make($password),
            'is_admin' => true,
        ]);

        $this->info("Created admin account for {$email}.");
        if (!$this->option('password')) {
            $this->warn("Generated password: {$password}");
        }

        return self::SUCCESS;
    }
}
