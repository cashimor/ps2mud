"""Create an isolated Pike 8 test copy without copying private player saves."""

from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Server"
TARGET = ROOT / ".runtime" / "pike"
ARRAY_TYPES = "string|object|int|float|mixed"
INVENTORY_KINDS = sorted(path.stem for path in (SOURCE / "items").glob("*.pike")
                         if path.stem not in {"item", "weapon", "armour"})


def convert_array_syntax(text: str) -> str:
    # Old Pike wrote arrays like C pointers. Current Pike uses array(type).
    declaration = re.compile(rf"^(\s*)({ARRAY_TYPES})\s+((?:\*?\w+\s*,\s*)*\*\w+(?:\s*,\s*\*?\w+)*)\s*;\s*$", re.MULTILINE)

    def replace_declaration(match: re.Match[str]) -> str:
        indent, kind, names = match.groups()
        statements = []
        for name in names.split(","):
            name = name.strip()
            is_array = name.startswith("*")
            name = name.lstrip("*").strip()
            dtype = f"array({kind})" if is_array else kind
            statements.append(f"{indent}{dtype} {name};")
        return "\n".join(statements)

    text = declaration.sub(replace_declaration, text)
    # Return types and function parameters.
    text = re.sub(rf"\b({ARRAY_TYPES})\s+\*\s*(\w+)(?=\s*\()", r"array(\1) \2", text)
    text = re.sub(rf"\b({ARRAY_TYPES})\s+\*\s*(\w+)(?=\s*[,\)])", r"array(\1) \2", text)
    return text


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for source in SOURCE.rglob("*"):
        relative = source.relative_to(SOURCE)
        if any(part in {"players", "RCS", "texconv"} for part in relative.parts):
            continue
        if source.is_dir():
            (TARGET / relative).mkdir(parents=True, exist_ok=True)
            continue
        if source.name in {"nohup.out", "loopserver"}:
            continue
        destination = TARGET / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix == ".pike":
            text = source.read_text(encoding="latin-1")
            text = convert_array_syntax(text)
            text = text.replace("#include <simulate.h>", "")
            text = text.replace("return;", "return 0;")
            text = text.replace("/home/mhofman/Pike/Server/players/", "players/")
            if "clone(" in text:
                text = "object clone(program p, mixed ... args) { return p(@args); }\n" + text
            if "strstr(" in text:
                text = "int strstr(string haystack, string needle) { return search(haystack, needle); }\n" + text
            if relative.as_posix() == "servd.pike":
                text = text.replace("bind(port,accept_callback)", 'bind(port,accept_callback,"127.0.0.1")')
                text = text.replace('  werror("Starting port receptor.\\n");',
                                    '  signal(15, lambda(int ignored) {\n'
                                    '    if(((object)"game")->save_all_players()) exit(0);\n'
                                    '    werror("Player save failed; server remains running.\\n");\n'
                                    '  });\n'
                                    '  werror("Starting port receptor.\\n");')
                text = "void create(mixed ... ignored) {}\n" + text
            if relative.as_posix() == "connect.pike":
                text = text.replace("  player->set_connection(0);",
                                    "  if(player) { player->save(); player->set_connection(0); }")
                text = text.replace("  werror(input);", "")
                text = text.replace('  werror(command+"\\n");', "")
                # Browser inventory rows can identify items with the same first
                # word, such as a usable stick and a burnt stick.
                text = text.replace("player->drop_item(words[1])", 'player->drop_item(words[1..]*" ")')
                text = text.replace("player->use_item(words[1])", 'player->use_item(words[1..]*" ")')
                text = text.replace('player->handle_shop(words[0],words[1])',
                                    'player->handle_shop(words[0],words[0]=="sell" ? words[1..]*" " : words[1])')
            if relative.as_posix() == "player.pike":
                kinds = ",".join(f'"{kind}"' for kind in INVENTORY_KINDS)
                text = f'array(string) inventory_kinds = ({{{kinds}}});\n' + text
                text = text.replace('void save() {', 'int save() {')
                text = text.replace('  rm(fn);\n  result="name="+name+"\\n";',
                                    '  result="name="+name+"\\n";')
                text = text.replace('  for(i=0;i<sizeof(items);i++) ag=ag+items[i]->get_value();',
                                    '  /* Items are now persisted individually; do not convert them to gold. */')
                text = text.replace('  result+="gold="+(gold+ag/4)+"\\n";',
                                    '  result+="gold="+gold+"\\n";')
                text = text.replace('  Stdio.write_file(fn,result);',
                                    '  for(i=0;i<sizeof(items);i++) {\n'
                                    '    string kind=items[i]->save_kind();\n'
                                    '    if(!has_value(inventory_kinds,kind)) continue;\n'
                                    '    string equipped=weapon==items[i] ? "w" : armour==items[i] ? "a" : "-";\n'
                                    '    result+="inventory="+kind+"|"+items[i]->save_state()+"|"+equipped+"\\n";\n'
                                    '  }\n'
                                    '  if(Stdio.write_file(fn+".tmp",result)!=sizeof(result) || !mv(fn+".tmp",fn)) {\n'
                                    '    werror("Unable to save player "+name+"\\n");\n'
                                    '    return 0;\n'
                                    '  }\n'
                                    '  return 1;')
                text = text.replace('      case "name":\n',
                                    '      case "inventory":\n'
                                    '        array(string) parts=words[1]/"|";\n'
                                    '        if(sizeof(parts)!=3 || !has_value(inventory_kinds,parts[0])) break;\n'
                                    '        object carried=clone((program)("items/"+parts[0]));\n'
                                    '        carried->set_room(this_object());\n'
                                    '        carried->load_save_state(parts[1],this_object());\n'
                                    '        add_item(carried);\n'
                                    '        if(parts[2]=="w" && carried->get_type()=="weapon") {\n'
                                    '          weapon=carried; carried->use(1,this_object());\n'
                                    '        }\n'
                                    '        if(parts[2]=="a" && carried->get_type()=="armour") {\n'
                                    '          armour=carried; carried->use(1,this_object());\n'
                                    '        }\n'
                                    '        break;\n'
                                    '      case "name":\n')
                text = text.replace(
                    '  for(i=0;i<sizeof(items);i++) {\n    words=(items[i]->get_short())/" ";',
                    '  for(i=0;i<sizeof(items);i++) {\n    if(items[i]->get_short()==what) return items[i];\n  }\n'
                    '  for(i=0;i<sizeof(items);i++) {\n    words=(items[i]->get_short())/" ";',
                )
                text = text.replace(
                    '  item=0;\n  for(i=0;i<sizeof(items);i++) {\n'
                    '    if((items[i]->get_short()/" ")[0]==what) item=items[i];\n  }',
                    '  item=present(what);',
                )
            if relative.as_posix() == "game.pike":
                text = text.replace('void shut_down() {',
                                    'int save_all_players() {\n'
                                    '  int i,ok=1;\n'
                                    '  for(i=0;i<sizeof(players);i++) if(!players[i]->save()) ok=0;\n'
                                    '  return ok;\n'
                                    '}\n\nvoid shut_down() {')
                text = text.replace('  for(i=0;i<sizeof(players);i++) players[i]->save();\n'
                                    '  shout("008 Shutdown now... Saving player characters.\\n");',
                                    '  if(!save_all_players()) {\n'
                                    '    werror("Shutdown cancelled: player save failed.\\n");\n'
                                    '    return;\n'
                                    '  }\n'
                                    '  shout("008 Shutdown now... Saving player characters.\\n");')
            if relative.as_posix() == "items/item.pike":
                text += '\nstring save_kind() { return ""; }\n'
                text += 'string save_state() { return ""; }\n'
                text += 'void load_save_state(string state,object player) {}\n'
            if relative.parent.as_posix() == "items" and relative.stem in INVENTORY_KINDS:
                text += f'\nstring save_kind() {{ return "{relative.stem}"; }}\n'
            if relative.as_posix() == "items/juice.pike":
                text += '\nstring save_state() { return get_short(); }\n'
                text += ('void load_save_state(string state,object player) {\n'
                         '  array(string) states=({"juice","bottle","water","sky","goo","magic","pee"});\n'
                         '  int index=search(states,state);\n'
                         '  if(index>=0) set_state(index);\n'
                         '}\n')
            if relative.as_posix() == "items/stick.pike":
                text += ('\nstring save_state() {\n'
                         '  int fuel=type=="torch" ? remove_call_out(out_of_fuel) : timeleft;\n'
                         '  if(type=="torch") call_out(out_of_fuel,fuel);\n'
                         '  return (type=="torch" ? "lit" : get_short())+","+fuel;\n'
                         '}\n'
                         'void load_save_state(string state,object player) {\n'
                         '  array(string) fields=state/",";\n'
                         '  if(sizeof(fields)!=2) return;\n'
                         '  timeleft=(int)fields[1];\n'
                         '  if(fields[0]=="lit" && timeleft>0) {\n'
                         '    type="torch"; short=base+" (lit)";\n'
                         '    call_out(out_of_fuel,timeleft);\n'
                         '    game->get_pointlight()->add_point_light_object(player);\n'
                         '    player->set_special_item(this_object());\n'
                         '  } else if(fields[0]==base+" (burnt)" || fields[0]==base+" (wet)") {\n'
                         '    short=fields[0]; value=2; timeleft=0;\n'
                         '  }\n'
                         '}\n')
                # The original top-ten loop reads negative indexes with fewer than ten players.
                text = text.replace(
                    "for(i=sizeof(names)-1;i>sizeof(names)-10;i--)",
                    "for(i=sizeof(names)-1;i>=0 && i>sizeof(names)-11;i--)",
                )
            destination.write_text(text, encoding="latin-1", newline="\n")
        else:
            if destination.exists() and destination.stat().st_size == source.stat().st_size:
                continue
            shutil.copy2(source, destination)
    (TARGET / "players").mkdir(exist_ok=True)
    print(f"Prepared isolated server at {TARGET}")


if __name__ == "__main__":
    main()
