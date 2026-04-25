import bcrypt from 'bcryptjs';
import pool from './database';

async function seed() {
  try {
    console.log('Seeding database...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3`,
      ['Admin', 'admin@geonex.com', adminPassword, 'admin']
    );

    // Create field user
    const fieldPassword = await bcrypt.hash('field123', 10);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3`,
      ['Field User', 'field@geonex.com', fieldPassword, 'field_user']
    );

    console.log('Seed completed successfully.');
    console.log('Admin: admin@geonex.com / admin123');
    console.log('Field: field@geonex.com / field123');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
