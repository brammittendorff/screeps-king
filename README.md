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

Optionally we can run bower install to install a third party library, for IDE referencing of in-game functions.

```
bower install
```

Then we need to set the environment variables

_**Note:** If you log in through Steam or Github, you can still set your Screeps email address and password for this to work_

* Windows

Set Environment Variables in of of the two ways below

for this session (CMD Environment Variables):

```
set EMAIL=your_email@example.com
set PASSWORD=yourpassword
```

or permanently (System Environment Variables):

```
setx EMAIL your_email@example.com
setx PASSWORD yourpassword
```

**Note:** _the latter will expose these variables on your system, for anyone to see and will require you to restart your terminal to take effect._

* Linux / Mac OS X

```
export EMAIL=your@email.com
export PASSWORD=YOURAWESOMEPASSWORD000!!!
```

You are now done installing.

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