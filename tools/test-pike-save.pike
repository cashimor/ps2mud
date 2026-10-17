int main() {
  string name="CodexSaveProbe";
  string path="players/"+name+".o";
  if(file_stat(path)) error("Refusing to overwrite an existing test character\n");
  object player=compile_file("player.pike")();
  player->set_name(name);
  object jacket=compile_file("items/jacket.pike")();
  jacket->set_room(player);
  player->add_item(jacket);
  player->armour=jacket;
  jacket->use(1,player);
  object potion=compile_file("items/juice.pike")();
  potion->set_state(3);
  potion->set_room(player);
  player->add_item(potion);
  object stick=compile_file("items/stick.pike")();
  stick->set_room(player);
  stick->load_save_state("stick (burnt),0",player);
  player->add_item(stick);
  object torch=compile_file("items/torch.pike")();
  torch->set_room(player);
  torch->load_save_state("lit,120",player);
  player->add_item(torch);
  if(!player->save()) error("Save failed\n");
  string saved=Stdio.read_file(path);
  if(!saved || search(saved,"inventory=jacket||a\n")<0 ||
      search(saved,"inventory=juice|sky|-\n")<0 ||
      search(saved,"inventory=stick|stick (burnt),0|-\n")<0 ||
      search(saved,"inventory=torch|lit,")<0)
    error("Inventory was not written correctly\n");
  object restored=compile_file("player.pike")();
  restored->load(path);
  if(!restored->present("jacket") || !restored->present("sky") ||
      !restored->present("stick") || !restored->present("torch") ||
      restored->present("torch")->get_type()!="torch" ||
      restored->armour==restored)
    error("Inventory did not restore correctly\n");
  rm(path);
  write("Pike inventory save/load passed\n");
  return 0;
}
