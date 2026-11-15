# Paleodig

Paleodig is a typescript game about digging fossils. It's the 1800's and you're a scientist trying to discover some dinosaurs, only issue is it's still not quite clear what these animals were. Dig up fossils, and from what little info you have you must lay the foundation for the scientists after your time to expand our knowledge on these prehistoric animals.

---------

## Gameplay: 

You play as a paleontologist trying to dig fossils from three different digsites.

The three digsites are laid out next to eachother. To dig from them, navigate the character onto them with the arrow keys and press spacebar to dig. 

If you find a fossil, you can choose to name it. You can give any fossil you find both a genus name and a species name. Once you've given a fossil a genus name, that name will be the name the game uses to refer to the animal you've found. It's up to you to try and find fossils and use their locations and appearance to try and see which fossils belong to which animals, and what you want to name them. But beware, once a genus name is in use, it hinges on your holotype fossil (first fossil to be given that name) for that name to remain valid. The validity of the discovery hinges on how many fossils you've found and correctly attributed to the same animal, as well as how distinct those findings are.

You have limited funds on which to spend on digging. You can sell the rocks you find for minimal returns, but they won't keep you afloat. More rare gems can prove more valuable, but money's not on your side. If it comes to the worst, you can sell some of your valuable fossils for more income, but a fossil that's been sold will become lost to science.

Once you believe your work is done, you can press the end button to end the game. When the game's over you'll get a final score based on how many of your discoveries have stood the test of time VS. how many discoveries you've accidentally misconstrued (such as mistakenly discovering the same animal twice and given two different names for example) or thrown away (selling fossils, rendering the bones unavailable for further studies).

------

## Installation

### Prerequisites

- Git
- [Node.js](https://nodejs.org/) 22.12 or newer, which includes npm. Vite also supports Node.js 20.19 or newer.
- Docker with Docker Compose, for the local PostgreSQL database.

On macOS or Windows, install [Docker Desktop](https://docs.docker.com/get-started/get-docker/) and open it before continuing. On Linux, install Docker Engine and the Docker Compose plugin. The Docker command-line client alone is not enough; the Docker engine must be running.

Check that the required tools are available:

```sh
git --version
node --version
npm --version
docker --version
docker compose version
docker info
```

### Setup

Clone the repository and install its dependencies from the repository root:

```sh
git clone https://github.com/OlofBjorn/Paleodig.git
cd Paleodig
npm install
```

Create the server's local environment file. On macOS, Linux, or Git Bash:

```sh
cp server/.env.example server/.env
```

In PowerShell, use:

```powershell
Copy-Item server/.env.example server/.env
```

The example config connects to the local PostgreSQL container defined in `docker-compose.yml`. Start the database; Docker downloads the PostgreSQL image if it is not already present:

```sh
docker compose up -d
```

Wait for PostgreSQL to finish starting before running migrations:

```sh
docker compose exec db pg_isready -U paleodig -d paleodig
```

Continue once the output says the server is accepting connections.

Create the schema and add the initial game data:

```sh
npm run db:migrate -w server
npm run db:seed -w server
```

### Run the game

Open two terminals at the repository root. Start the API server in the first:

```sh
npm run dev:server
```

Start the client in the second:

```sh
npm run dev:client
```

Open the client URL printed by Vite, usually <http://localhost:5173>. To verify that the server can reach PostgreSQL, visit <http://localhost:3000/api/health>; it should return `{"status":"ok","db":"up"}`.

To stop the local database, run `docker compose down` from the repository root. This keeps its data volume for the next run.

------

## Techstack

### Frontend
- Phaser
- TypeScript
- Vite

### Backend
- Node.js
- Fastify
- TypeScript

### Database
- PostgreSQL
- Drizzle ORM
