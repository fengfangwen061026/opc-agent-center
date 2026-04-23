create table if not exists notifications (
  id text primary key,
  payload text not null,
  updated_at text not null
);

create table if not exists obsidian_write_queue (
  id integer primary key autoincrement,
  path text not null,
  content text not null,
  options text not null,
  status text not null default 'pending',
  created_at text not null
);
