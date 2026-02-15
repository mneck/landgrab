extends Control

func _ready():
	var button = $Button
	button.pressed.connect(_on_start_pressed)

func _on_start_pressed():
	get_tree().change_scene_to_file("res://scenes/Game.tscn")
