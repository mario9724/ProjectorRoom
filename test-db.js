/**
 * Script de prueba para verificar la conexión a la base de datos
 * Uso: node test-db.js
 */

require('dotenv').config();
const db = require('./database');

async function testConnection() {
  console.log('🔍 Probando conexión a PostgreSQL...\n');
  
  try {
    // Probar conexión básica
    const result = await db.pool.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Conexión exitosa!');
    console.log('📅 Hora del servidor:', result.rows[0].current_time);
    console.log('📦 Versión de PostgreSQL:', result.rows[0].pg_version.split(',')[0]);
    console.log('');
    
    // Inicializar base de datos
    console.log('🔨 Inicializando tablas...');
    await db.initDatabase();
    console.log('');
    
    // Verificar tablas creadas
    const tablesResult = await db.pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Tablas creadas:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    console.log('');
    
    // Crear una sala de prueba
    console.log('🧪 Creando sala de prueba...');
    const testRoom = await db.createRoom({
      id: 'test123',
      roomName: 'Sala de Prueba',
      hostUsername: 'TestUser',
      manifest: 'https://test.json',
      sourceUrl: 'https://test.mp4',
      useHostSource: true,
      projectorType: 'public',
      customManifest: null
    });
    console.log('✅ Sala creada:', testRoom.room_name);
    console.log('');
    
    // Agregar información de media
    console.log('🎬 Agregando información de película...');
    await db.saveMediaInfo('test123', {
      title: 'Película de Prueba',
      original_title: 'Test Movie',
      overview: 'Esta es una película de prueba para verificar la base de datos.',
      release_date: '2024-01-01',
      media_type: 'movie',
      vote_average: 8.5,
      genres: [{ id: 1, name: 'Drama' }],
      runtime: 120
    });
    console.log('✅ Información de media guardada');
    console.log('');
    
    // Agregar mensaje de chat
    console.log('💬 Agregando mensaje de chat...');
    await db.saveChatMessage('test123', 'TestUser', '¡Hola! Esta es una prueba');
    console.log('✅ Mensaje guardado');
    console.log('');
    
    // Agregar calificación
    console.log('⭐ Agregando calificación...');
    await db.saveRating('test123', 'TestUser', 9);
    const avgRating = await db.getAverageRating('test123');
    console.log('✅ Calificación guardada. Promedio:', avgRating.average_rating);
    console.log('');
    
    // Agregar reacción
    console.log('💭 Agregando reacción...');
    await db.saveReaction('test123', 'TestUser', 45, '¡Qué escena tan increíble!');
    console.log('✅ Reacción guardada');
    console.log('');
    
    // Obtener estadísticas
    console.log('📊 Obteniendo estadísticas...');
    const stats = await db.getRoomStats('test123');
    console.log('Estadísticas de la sala:');
    console.log('   - Mensajes:', stats.total_messages);
    console.log('   - Calificaciones:', stats.total_ratings);
    console.log('   - Promedio:', stats.avg_rating);
    console.log('   - Reacciones:', stats.total_reactions);
    console.log('');
    
    // Limpiar datos de prueba
    console.log('🧹 Limpiando datos de prueba...');
    await db.deleteRoom('test123');
    console.log('✅ Datos de prueba eliminados');
    console.log('');
    
    console.log('🎉 ¡Todas las pruebas pasaron exitosamente!');
    console.log('La base de datos está lista para usar.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Verifica que:');
    console.error('1. La variable DATABASE_URL esté configurada correctamente en .env');
    console.error('2. La base de datos PostgreSQL esté activa y accesible');
    console.error('3. Las credenciales sean correctas');
    process.exit(1);
  } finally {
    await db.pool.end();
    console.log('\n👋 Conexión cerrada');
  }
}

testConnection();
