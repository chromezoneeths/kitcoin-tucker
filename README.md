# kitcoin-node

A backend server for Kitcoin.

This is Tucker's proposal, currently being refactored from the [early prototype](https://git.spaghet.us/ethsdev/kitcoin-backend).

Features include Docker deployment, Google Classroom integration, and a fairly simple client library.

## Usage

This software is deployed using Docker. This *should* make deployment fairly painless.

1. Modify `docker-compose.yml` to your liking. You should at least change `OAUTH_CALLBACK_URL` and the password variables. `OAUTH_CALLBACK_URL` should have any HTTP(S) requests routed to port 9876 on this server.
2. Create an `oauth_info.json` file with your Google API keys. An example is provided.
3. Set up a reverse proxy for https support and other fun things that are completely out of scope for this project.
4. Run `docker-compose up -d --build` to bring up the stack, and hopefully it'll work fine. Subsequent runs with no configuration changes or updates can omit the `--build` option, but to update to new versions you'll need it.

## For Developers

An API library for interaction with this server is provided [here.](https://git.spaghet.us/ethsdev/libkitcoin) There's even a reference command-line implementation in case you're having trouble figuring it out. It'll work in Node or in the browser with Browserify.

## Administration

Administering this software is admittedly a bit ugly; you'll need to run `docker exec -it kitcoinnode_sqldb_1 mysql -p` to enter the database's shell.

* To make a user an administrator, run `USE kitcoin; UPDATE users SET admin=b'1' WHERE address='your-email-goes-here'`. Replace `b'1'` with `b'0'` to revoke administrative privileges. Currently this only restricts minting and voiding.
* To list users, run `USE kitcoin; SELECT * FROM users`.
* Other, more user-friendly administrative tools are in development. To use this software, you'll want to set the `ENABLE_REMOTE` environment variable to 1, then attempt a connection as normal, then send the `elevate` action.
