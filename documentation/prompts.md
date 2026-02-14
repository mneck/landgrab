I am making a game that happens on a hex-grid map where characters alternate between acquire and play cards to place properties on the map.

To this end, I want to use the information in @documentation/Hexagonal_Grids_files specifically here:
@Hexagonal_Grids.html (734-740) 

to create a coordinate system to make maps for my game. The plan for this should be saved to:@documentation/Hex_Grid_Info.md 

I want to build this game using GD Script (Godot) to create a game that can be played in a single-player mode against the computer or as a multiplayer game, either on the same computer (locally) or online. For my first version of the game, I would like to create a build that can be played locally so that I can test the game out with my friends on my computer.

As a first step, I want to create the hex map grid, and I want documentation outlining how I can do that. So the initially created hex map should have 0,0,0 coordinates for the center hex, and the map should be composed of gray "Fog" tiles in the center tiles, with a border of Field, Mountain, Desert, and Forest tiles to create a coastline, which are surrounded by Water tiles. Each hex map should be a separate island. Please create a plan outlining all this in @documentation/Hex_Grid_Info.md - details about the game mechanics are in @README.md 