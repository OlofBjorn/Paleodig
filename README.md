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

Step 1:

Clone the depository:
```
    git clone https://github.com/OlofBjorn/Paleodig
    cd Paleodig
```

Step 2:

Install NPM:
```
    npm install
```

Step 3:

Create local env:
```
cp server/.env.example server/.env
```

Step 4:

Install docker:
https://www.docker.com/


Step 5:

Start PostgreSQL:
```
docker compose up -d
```

Step 6:

Create the database schema and load game data:
```
    npm run db:migrate -w server
    npm run db:seed -w server
```

Step 7:

Run the server and client in two terminals:
```
    npm run dev:server
```
```
    npm run dev:server
```

------

## Techstack

Frontend:
    * Phaser
    * Typescript
    * Vite

Backend:
    * Node.js
    * Fastify
    * Typescript

Database:
    * PostgreSQL
    * Drizzle
