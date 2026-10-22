-- PhobiaCheck schema: user-driven phobia trigger reports for movies and series.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Phobias (curated seed + user suggestions moderated by admins)
-- ---------------------------------------------------------------------------
create type public.phobia_status as enum ('approved', 'pending', 'rejected');

create table public.phobias (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_en text not null check (char_length(name_en) between 2 and 80),
  name_es text not null check (char_length(name_es) between 2 and 80),
  description_en text check (char_length(description_en) <= 300),
  description_es text check (char_length(description_es) <= 300),
  status public.phobia_status not null default 'pending',
  suggested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Titles (cached TMDB metadata, created on first vote)
-- ---------------------------------------------------------------------------
create table public.titles (
  id bigint generated always as identity primary key,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  name text not null,
  year integer,
  poster_path text,
  created_at timestamptz not null default now(),
  unique (media_type, tmdb_id)
);

-- ---------------------------------------------------------------------------
-- Votes: one yes/no per user, title and phobia
-- ---------------------------------------------------------------------------
create table public.votes (
  title_id bigint not null references public.titles (id) on delete cascade,
  phobia_id bigint not null references public.phobias (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  present boolean not null,
  updated_at timestamptz not null default now(),
  primary key (title_id, phobia_id, user_id)
);

create index votes_phobia_idx on public.votes (phobia_id);
create index votes_updated_idx on public.votes (updated_at desc);

-- ---------------------------------------------------------------------------
-- Occurrences: where in the title the trigger shows up (spoiler-hidden in UI)
-- ---------------------------------------------------------------------------
create table public.occurrences (
  id bigint generated always as identity primary key,
  title_id bigint not null references public.titles (id) on delete cascade,
  phobia_id bigint not null references public.phobias (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  season integer check (season between 0 and 200),
  episode integer check (episode between 0 and 5000),
  time_seconds integer check (time_seconds between 0 and 86400),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  check (time_seconds is not null or note is not null)
);

create index occurrences_title_idx on public.occurrences (title_id, phobia_id);

-- ---------------------------------------------------------------------------
-- Aggregated view
-- ---------------------------------------------------------------------------
create view public.title_phobia_summary
with (security_invoker = true)
as
select
  v.title_id,
  v.phobia_id,
  count(*) filter (where v.present) as yes_count,
  count(*) filter (where not v.present) as no_count,
  max(v.updated_at) as last_vote_at
from public.votes v
group by v.title_id, v.phobia_id;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.phobias enable row level security;
alter table public.titles enable row level security;
alter table public.votes enable row level security;
alter table public.occurrences enable row level security;

-- profiles: public display names; users may only change their own display name
create policy "profiles are readable" on public.profiles
  for select using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- phobias
create policy "approved phobias are public" on public.phobias
  for select using (
    status = 'approved'
    or suggested_by = (select auth.uid())
    or (select public.is_admin())
  );
create policy "users suggest phobias" on public.phobias
  for insert to authenticated
  with check (status = 'pending' and suggested_by = (select auth.uid()));
create policy "admins moderate phobias" on public.phobias
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete phobias" on public.phobias
  for delete to authenticated using ((select public.is_admin()));

-- titles
create policy "titles are public" on public.titles
  for select using (true);
create policy "users add titles" on public.titles
  for insert to authenticated with check (true);

-- votes
create policy "votes are public" on public.votes
  for select using (true);
create policy "users cast own votes" on public.votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.phobias p where p.id = phobia_id and p.status = 'approved')
  );
create policy "users change own votes" on public.votes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "users remove own votes" on public.votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- occurrences
create policy "occurrences are public" on public.occurrences
  for select using (true);
create policy "users add occurrences" on public.occurrences
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.phobias p where p.id = phobia_id and p.status = 'approved')
  );
create policy "users or admins delete occurrences" on public.occurrences
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Seed: curated phobia list
-- ---------------------------------------------------------------------------
insert into public.phobias (slug, name_en, name_es, description_en, description_es, status) values
  ('cats', 'Cats (ailurophobia)', 'Gatos (ailurofobia)', 'Cats appear on screen, including attacks or jump scares.', 'Aparecen gatos, incluidos ataques o sustos.', 'approved'),
  ('dogs', 'Dogs (cynophobia)', 'Perros (cinofobia)', 'Dogs appear, especially aggressive or attacking dogs.', 'Aparecen perros, especialmente agresivos o atacando.', 'approved'),
  ('spiders', 'Spiders (arachnophobia)', 'Arañas (aracnofobia)', 'Spiders or spider-like creatures.', 'Arañas o criaturas similares.', 'approved'),
  ('snakes', 'Snakes (ophidiophobia)', 'Serpientes (ofidiofobia)', 'Snakes or serpents.', 'Serpientes o culebras.', 'approved'),
  ('insects', 'Insects & bugs (entomophobia)', 'Insectos (entomofobia)', 'Swarms, cockroaches, bugs crawling on people.', 'Enjambres, cucarachas, bichos sobre personas.', 'approved'),
  ('bees-wasps', 'Bees & wasps (apiphobia)', 'Abejas y avispas (apifobia)', 'Bees, wasps or stings.', 'Abejas, avispas o picaduras.', 'approved'),
  ('rats-mice', 'Rats & mice (musophobia)', 'Ratas y ratones (musofobia)', 'Rodents on screen.', 'Roedores en pantalla.', 'approved'),
  ('birds', 'Birds (ornithophobia)', 'Aves (ornitofobia)', 'Birds, flocks or bird attacks.', 'Aves, bandadas o ataques de aves.', 'approved'),
  ('sharks', 'Sharks (galeophobia)', 'Tiburones (galeofobia)', 'Sharks or shark attacks.', 'Tiburones o ataques de tiburón.', 'approved'),
  ('worms', 'Worms & parasites', 'Gusanos y parásitos', 'Worms, maggots or parasites, including inside bodies.', 'Gusanos, larvas o parásitos, incluso dentro del cuerpo.', 'approved'),
  ('trypophobia', 'Clusters of holes (trypophobia)', 'Agujeros agrupados (tripofobia)', 'Clusters of small holes or bumps on skin or objects.', 'Grupos de pequeños agujeros o bultos en piel u objetos.', 'approved'),
  ('needles', 'Needles & injections (trypanophobia)', 'Agujas e inyecciones (tripanofobia)', 'Injections, syringes or needles piercing skin.', 'Inyecciones, jeringas o agujas en la piel.', 'approved'),
  ('blood', 'Blood (hemophobia)', 'Sangre (hemofobia)', 'Visible blood or bleeding.', 'Sangre visible o hemorragias.', 'approved'),
  ('vomit', 'Vomiting (emetophobia)', 'Vómito (emetofobia)', 'Characters vomiting or nausea scenes.', 'Personajes vomitando o escenas de náuseas.', 'approved'),
  ('eye-trauma', 'Eye injury', 'Lesiones oculares', 'Damage to eyes or objects near eyes.', 'Daño a los ojos u objetos cerca de ellos.', 'approved'),
  ('teeth', 'Teeth injury & dentists', 'Dientes y dentistas', 'Teeth breaking, being pulled, or dental procedures.', 'Dientes rotos, extraídos o procedimientos dentales.', 'approved'),
  ('body-horror', 'Body horror', 'Horror corporal', 'Mutilation, mutation or bodies deforming.', 'Mutilación, mutación o cuerpos deformándose.', 'approved'),
  ('surgery', 'Surgery & medical procedures', 'Cirugías y procedimientos médicos', 'Graphic operations or hospital procedures.', 'Operaciones gráficas o procedimientos hospitalarios.', 'approved'),
  ('clowns', 'Clowns (coulrophobia)', 'Payasos (coulrofobia)', 'Clowns, scary or otherwise.', 'Payasos, aterradores o no.', 'approved'),
  ('dolls', 'Dolls & mannequins (pediophobia)', 'Muñecas y maniquíes (pediofobia)', 'Dolls, puppets or mannequins, especially animated.', 'Muñecas, marionetas o maniquíes, sobre todo animados.', 'approved'),
  ('masks', 'Masks', 'Máscaras', 'Masked characters.', 'Personajes con máscara.', 'approved'),
  ('ghosts', 'Ghosts & possession', 'Fantasmas y posesiones', 'Ghosts, demons or possession.', 'Fantasmas, demonios o posesiones.', 'approved'),
  ('jump-scares', 'Jump scares', 'Sustos repentinos', 'Sudden loud scares.', 'Sustos súbitos y ruidosos.', 'approved'),
  ('heights', 'Heights (acrophobia)', 'Alturas (acrofobia)', 'Vertigo-inducing heights, falls or ledges.', 'Alturas, caídas o cornisas que dan vértigo.', 'approved'),
  ('enclosed', 'Enclosed spaces (claustrophobia)', 'Espacios cerrados (claustrofobia)', 'Being trapped, buried alive or in tight spaces.', 'Quedar atrapado, enterrado vivo o en espacios estrechos.', 'approved'),
  ('deep-water', 'Deep water (thalassophobia)', 'Aguas profundas (talasofobia)', 'Open ocean, deep or dark water.', 'Océano abierto, aguas profundas u oscuras.', 'approved'),
  ('drowning', 'Drowning', 'Ahogamiento', 'Characters drowning or held underwater.', 'Personajes ahogándose o sumergidos a la fuerza.', 'approved'),
  ('darkness', 'Darkness (nyctophobia)', 'Oscuridad (nictofobia)', 'Long scenes in near-total darkness.', 'Escenas largas en oscuridad casi total.', 'approved'),
  ('fire', 'Fire & burning (pyrophobia)', 'Fuego y quemaduras (pirofobia)', 'Fires or people burning.', 'Incendios o personas quemándose.', 'approved'),
  ('flying', 'Plane crashes & flying', 'Accidentes aéreos y volar', 'Turbulence or plane crashes.', 'Turbulencias o accidentes de avión.', 'approved'),
  ('car-crash', 'Car crashes', 'Accidentes de tráfico', 'Vehicle collisions.', 'Choques de vehículos.', 'approved'),
  ('storms', 'Storms & natural disasters', 'Tormentas y desastres naturales', 'Tornadoes, earthquakes, tsunamis.', 'Tornados, terremotos, tsunamis.', 'approved'),
  ('flashing-lights', 'Flashing lights', 'Luces intermitentes', 'Strobe or flashing lights (photosensitivity).', 'Luces estroboscópicas o parpadeantes (fotosensibilidad).', 'approved'),
  ('pregnancy', 'Pregnancy & childbirth (tokophobia)', 'Embarazo y parto (tocofobia)', 'Childbirth or pregnancy complications.', 'Partos o complicaciones del embarazo.', 'approved'),
  ('death-animal', 'Animal death', 'Muerte de animales', 'An animal dies or is hurt.', 'Un animal muere o resulta herido.', 'approved'),
  ('corpses', 'Corpses (necrophobia)', 'Cadáveres (necrofobia)', 'Dead bodies shown on screen.', 'Cadáveres mostrados en pantalla.', 'approved'),
  ('skin', 'Skin peeling & rashes (dermatophobia)', 'Piel y erupciones (dermatofobia)', 'Peeling skin, rashes or skin diseases.', 'Piel pelándose, erupciones o enfermedades de la piel.', 'approved'),
  ('crowds', 'Crowds (enochlophobia)', 'Multitudes (enoclofobia)', 'Dense crowds, stampedes or crushes.', 'Multitudes, estampidas o aplastamientos.', 'approved'),
  ('hanging', 'Hanging & choking', 'Ahorcamiento y asfixia', 'Hanging, strangling or choking.', 'Ahorcamiento, estrangulamiento o asfixia.', 'approved'),
  ('aliens', 'Aliens & abduction', 'Extraterrestres y abducciones', 'Alien creatures or abductions.', 'Criaturas alienígenas o abducciones.', 'approved'),
  ('robots', 'Uncanny robots & AI', 'Robots y IA inquietantes', 'Humanlike robots or androids.', 'Robots o androides de aspecto humano.', 'approved'),
  ('ticks', 'Ticks & mites', 'Garrapatas y ácaros', 'Ticks or mites on skin.', 'Garrapatas o ácaros en la piel.', 'approved');
