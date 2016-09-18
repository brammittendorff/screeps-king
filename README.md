# A screeps repository

## Installation

First we need grunt

```
npm install -g grunt
```

After that we will need all npm packages so run

```
npm install
```

### Then we need to set the environment variables

_**Note:** If you log in through Steam or Github, you can still set your Screeps email address and password for this to work_

#### Windows

Set Environment Variables in of of the two ways below

##### 1 only for the current CMD session (CMD Environment Variables):

```
set SCREEPS_EMAIL=your_email@example.com
set SCREEPS_PASSWORD=yourpassword
```

##### 2 Permanently (System Environment Variables):

```
setx SCREEPS_EMAIL your_email@example.com
setx SCREEPS_PASSWORD yourpassword
```

_**Note:** This will expose the variables to your system, for anyone to see and will require you to restart your terminal to take effect._

#### Linux / Mac OS X

```
export SCREEPS_EMAIL=your_email@example.com
export SCREEPS_PASSWORD=yourpassword
```

You are now done installing.

## Optional

_**Optionally** we can run bower install to install a third party library, for IDE referencing of in-game functions._

```
bower install
```

## Syncing files

Before push our files to the game, we need to first compile our files to dist.

```
grunt concat
```

After that we can push our files

```
grunt screeps
```

Or the shorthand version of both actions

```
grunt sync
```

## Auto-sync

Should you wish to auto-sync any save directly to the game, this is possible using grunt-contrib-watch.
Once entering the below command, grunt will watch for any changes, then regenerate the `/dist`-folder
and sync the dist folder with your game.

```
grunt watch
```
