import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.owner.upsert({
    where: { email: 'owner@subcurrent.app' },
    update: {},
    create: {
      email: 'owner@subcurrent.app',
      name: 'Subcurrent Owner',
      role: 'admin',
      passwordHash: await bcrypt.hash('changeme123', 12),
    },
  });

  const artistData = [
    { key: 'bluetech', name: 'Bluetech', genre: 'Downtempo / bass', soundcloudUrl: 'https://soundcloud.com/bluetech' },
    { key: 'flintwick', name: 'Flintwick', genre: 'Bass music', soundcloudUrl: 'https://soundcloud.com/flintwick' },
    { key: 'goosebumpz', name: 'Goosebumpz', genre: 'Bass music', soundcloudUrl: 'https://soundcloud.com/goosebumpz' },
    { key: 'ovoid', name: 'Ovoid', genre: 'Bass music', soundcloudUrl: 'https://soundcloud.com/ovoid' },
    { key: 'paytonlacy', name: 'Payton Lacy', genre: 'Bass music', soundcloudUrl: 'https://soundcloud.com/payton-lacy' },
    { key: 'somatoast', name: 'Somatoast', genre: 'Glitch hop / bass', soundcloudUrl: 'https://soundcloud.com/somatoast' },
    { key: 'vinja', name: 'Vinja', genre: 'Bass music', soundcloudUrl: 'https://soundcloud.com/vinja' },
  ];
  const artists = {};
  for (const a of artistData) {
    artists[a.key] = await prisma.artist.upsert({
      where: { id: a.key },
      update: {},
      create: { id: a.key, name: a.name, genre: a.genre, soundcloudUrl: a.soundcloudUrl },
    });
  }

  const night1 = new Date('2026-10-23T21:00:00-06:00');
  const night2 = new Date('2026-10-24T21:00:00-06:00');

  const event = await prisma.event.upsert({
    where: { slug: 'ReTurnalNights' },
    update: {},
    create: {
      title: 'Re:Turnal Nights',
      slug: 'ReTurnalNights',
      status: 'on_sale',
      startAt: night1,
      doorsAt: night1,
      venueName: 'TBA',
      venueAddr: 'TBA',
      revealMode: 'timed',
      dropAt: new Date(night1.getTime() - 30 * 60 * 1000),
      tiers: {
        create: [
          { name: 'Early bird', priceCents: 2000, capacity: 50, soldCount: 50, salesOpen: false },
          { name: 'General admission', priceCents: 3000, capacity: 300 },
          { name: 'VIP', priceCents: 5000, capacity: 40 },
        ],
      },
      lineup: {
        create: [
          { artistId: artists.somatoast.id, startTime: night1, sortOrder: 0 },
          { artistId: artists.flintwick.id, startTime: new Date(night1.getTime() + 75 * 60 * 1000), sortOrder: 1 },
          { artistId: artists.goosebumpz.id, startTime: new Date(night1.getTime() + 150 * 60 * 1000), sortOrder: 2 },
          { artistId: artists.bluetech.id, startTime: night2, sortOrder: 3 },
          { artistId: artists.ovoid.id, startTime: new Date(night2.getTime() + 75 * 60 * 1000), sortOrder: 4 },
          { artistId: artists.paytonlacy.id, startTime: new Date(night2.getTime() + 150 * 60 * 1000), sortOrder: 5 },
          { artistId: artists.vinja.id, startTime: new Date(night2.getTime() + 225 * 60 * 1000), sortOrder: 6 },
        ],
      },
    },
  });

  console.log('Seeded:', { owner: owner.email, event: event.slug, artists: Object.keys(artists).length });
}

main().finally(() => prisma.$disconnect());
