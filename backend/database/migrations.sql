-- MproWave Database Migrations
-- Run this SQL script to create all necessary tables

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS mprowave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mprowave;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified_at TIMESTAMP NULL,
    password VARCHAR(255) NOT NULL,
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    bpm INT NOT NULL DEFAULT 120,
    `key` VARCHAR(255) NOT NULL DEFAULT 'C',
    time_signature VARCHAR(255) NOT NULL DEFAULT '4/4',
    settings JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tracks table
CREATE TABLE IF NOT EXISTS tracks (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    type ENUM('audio', 'midi', 'instrument') NOT NULL DEFAULT 'audio',
    audio_url VARCHAR(255) NULL,
    midi_data JSON NULL,
    volume DECIMAL(5,2) NOT NULL DEFAULT 0.80,
    pan DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    muted TINYINT(1) NOT NULL DEFAULT 0,
    solo TINYINT(1) NOT NULL DEFAULT 0,
    effects JSON NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_id (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Personal access tokens table (for Laravel Sanctum)
CREATE TABLE IF NOT EXISTS personal_access_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tokenable_type VARCHAR(255) NOT NULL,
    tokenable_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    abilities TEXT NULL,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_tokenable (tokenable_type, tokenable_id),
    INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrations table (to track migrations)
CREATE TABLE IF NOT EXISTS migrations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    migration VARCHAR(255) NOT NULL,
    batch INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert migration records
INSERT INTO migrations (migration, batch) VALUES
('2024_01_01_000000_create_users_table', 1),
('2024_01_01_000001_create_projects_table', 1),
('2024_01_01_000002_create_tracks_table', 1),
('2024_01_01_000003_create_personal_access_tokens_table', 1);

-- Success message
SELECT 'Database migration completed successfully!' AS message;
SELECT 'You can now use the MproWave API.' AS status;
