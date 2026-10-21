import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// The owner password is never committed. Set OWNER_PASSWORD to choose one;
// otherwise a strong random password is generated and written to
// .owner-credentials at the repo root (git-ignored), never printed.
function ownerPassword() {
  if (process.env.OWNER_PASSWORD) return { value: process.env.OWNER_PASSWORD, generated: false };
  return { value: crypto.randomBytes(15).toString('base64url'), generated: true };
}
const credsFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.owner-credentials');

const prisma = new PrismaClient();

async function main() {
  const existingOwner = await prisma.owner.findUnique({ where: { email: 'owner@subcurrent.app' } });
  let owner = existingOwner;
  if (!existingOwner) {
    const pw = ownerPassword();
    owner = await prisma.owner.create({
      data: { email: 'owner@subcurrent.app', name: 'Subcurrent Owner', role: 'admin', passwordHash: await bcrypt.hash(pw.value, 12) },
    });
    if (pw.generated) {
      fs.appendFileSync(
        credsFile,
        `# ${new Date().toISOString()} ${process.env.SEED_LABEL || 'seed'} (${String(process.env.DATABASE_URL || '').split('@').pop().split('?')[0]})\nemail=owner@subcurrent.app\npassword=${pw.value}\n\n`,
        { mode: 0o600 }
      );
      console.log('Owner password generated and saved to .owner-credentials (not printed).');
    }
  }

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

  // Mirror the four shows the front-end prototype renders, keyed by the same
  // slugs, so the app's own checkout/publish buttons can map onto real rows.
  // Prices and VIP counts match the prototype's tier data exactly.
  const appShows = [
    { slug: 'ReturnalNights-Oct23', title: 'Re:Turnal Night One', status: 'on_sale', at: '2026-10-23T21:00:00-06:00', ga: 35, vip: 65, vipLeft: 18, early: 25 },
    { slug: 'ReturnalNights-Oct24', title: 'Re:Turnal Night Two', status: 'on_sale', at: '2026-10-24T21:00:00-06:00', ga: 35, vip: 65, vipLeft: 30, early: 25 },
    { slug: 'HallowCurrentAfters', title: 'Hallow Current Afters', status: 'on_sale', at: '2026-11-08T02:00:00-07:00', ga: 28, vip: 50, vipLeft: 24, early: 22 },
    // Draft on purpose: the owner portal's "Publish" button flips it on sale.
    { slug: 'UndertowAfters', title: 'Undertow Afters', status: 'draft', at: '2026-11-15T02:00:00-07:00', ga: 25, vip: 45, vipLeft: 40, early: 20 },
  ];
  for (const s of appShows) {
    const start = new Date(s.at);
    await prisma.event.upsert({
      where: { slug: s.slug },
      update: {},
      create: {
        title: s.title,
        slug: s.slug,
        status: s.status,
        startAt: start,
        doorsAt: start,
        venueName: 'TBA',
        venueAddr: 'TBA',
        revealMode: 'timed',
        dropAt: new Date(start.getTime() - 3 * 60 * 60 * 1000),
        tiers: {
          create: [
            { name: 'Early bird', priceCents: s.early * 100, capacity: 50, soldCount: 50, salesOpen: false },
            { name: 'General admission', priceCents: s.ga * 100, capacity: 300 },
            { name: 'VIP', priceCents: s.vip * 100, capacity: 40, soldCount: 40 - s.vipLeft },
          ],
        },
      },
    });
  }

  // The prototype's built-in feed posts, keyed by its ids (appKey) so the
  // app's own like/comment/vote buttons map to real rows. Counts start at
  // zero: only real interactions are stored. p8 is the prototype's example
  // of a held resale post, so it starts in the moderation queue.
  if (!(await prisma.post.count())) {
    const H = 3600_000;
    const now = Date.now();
    const appPosts = [
      { appKey: 'p1', by: 'Subcurrent', team: true, pinned: true, ago: 2, ev: 'ReturnalNights-Oct24', text: 'Re:Turnal Night Two is on the calendar. Members presale is open now with code SUBFAM. The location drops at 6 PM to ticket holders.', cms: [['Dev O.', 'Already locked in. See everyone on the rail.', 1], ['Lena F.', 'First SC afters for me!', 1.5]] },
      { appKey: 'p2', by: 'Subterra Static', ago: 5, text: 'Dialed in a new downtempo pack for Saturday. If you hear the siren, get low. #ReturnalNights-Oct23', cms: [['Maya R.', 'THE SIREN. Say less.', 4]] },
      { appKey: 'p3', by: 'Maya R.', ago: 9, text: 'Last weekend from the rail. That laser wall at 4 AM was something else.', cms: [['Jordan T.', 'We were right behind you', 8]] },
      { appKey: 'p4', by: 'Subcurrent', team: true, ago: 26, text: 'Help us pick the theme for the December afters.', poll: ['Downtempo all night', 'Psybass takeover', 'Melodic sunrise set'], cms: [['Tasha G.', 'Psybass takeover or riot', 20]] },
      { appKey: 'p5', by: 'Hollow Yeti', ago: 30, ev: 'HallowCurrentAfters', text: 'Denver, Hallow Current Afters is going to be loud. Bringing two unreleased tunes.', cms: [['Dev O.', 'Hollow Yeti at sunrise is the move', 29]] },
      { appKey: 'p6', by: 'Jules P.', ago: 34, text: 'Door tip from the crew: have your ID out and your ticket open before you reach the line. We move a lot faster that way.', cms: [['Lena F.', 'Noted, thank you!', 33]] },
      { appKey: 'p7', by: 'Dev O.', ago: 50, text: 'PSA from a 21-afters veteran: hydrate, bring earplugs, and say hi to the door crew. They work hard.', cms: [] },
      { appKey: 'p8', by: 'Jordan T.', ago: 3, held: 'Possible ticket resale with a price', text: 'Selling 2 GA for Re:Turnal, $60 each, venmo me', cms: [] },
    ];
    for (const p of appPosts) {
      await prisma.post.create({
        data: {
          appKey: p.appKey,
          authorName: p.by,
          fromTeam: Boolean(p.team),
          ownerId: p.team ? owner.id : null,
          pinned: Boolean(p.pinned),
          eventSlug: p.ev,
          text: p.text,
          pollJson: p.poll ? JSON.stringify(p.poll) : null,
          status: p.held ? 'held' : 'visible',
          heldReason: p.held || null,
          createdAt: new Date(now - p.ago * H),
          comments: { create: p.cms.map(([name, text, ago]) => ({ authorName: name, text, createdAt: new Date(now - ago * H) })) },
        },
      });
    }
  }

  console.log('Seeded:', { owner: owner.email, event: event.slug, artists: Object.keys(artists).length });
}

main().finally(() => prisma.$disconnect());
