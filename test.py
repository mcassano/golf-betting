import subprocess

def send_imessage(message):
    script = f'''
    tell application "Messages"
        set targetChat to chat id "any;+;chat709523096725922400"
        send "{message}" to targetChat
    end tell
    '''
    subprocess.run(["osascript", "-e", script])

send_imessage("bot test")

