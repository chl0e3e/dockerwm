import aiohttp_jinja2
import aiodocker
import jinja2
import json
import os
import asyncio
import base64
from aiohttp import web, WSMsgType

dockerwm_root_directory = os.path.dirname(__file__)

def rel_path(path):
    return os.path.join(dockerwm_root_directory, path)

routes = web.RouteTableDef()

@routes.get('/')
@aiohttp_jinja2.template('app.jinja2')
async def index(request):
    return {}

async def list_things(docker, ws):
    result = {}
    result["images"] = []
    result["containers"] = []

    images = await docker.images.list()
    for image in images:
        tags = image['RepoTags'][0] if image['RepoTags'] else ''
        result["images"].append({
            "tags": tags,
            "id": image["Id"]
        })

    containers = await docker.containers.list()
    for container in containers:
        result["containers"].append({
            "id": container._id
        })

    return result

stream = {}

async def setup_container(docker, ws, data):
    await ws.send_str(json.dumps({"cmd": "data", "data": "Attempting to create container %s.\r\n" % (data["name"])}))
    container = await docker.containers.create_or_replace(
        config={
            'Cmd': data["cmd"],
            'Image': data["image"],
            "AttachStdin": True,
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": True,
            "OpenStdin": True,
        },
        name=data["name"],
    )
    
    # container_ws = await container.websocket(stdin=True, stdout=True, stderr=True, stream=True)
    await container.start()
    await ws.send_str(json.dumps({"cmd": "container_start", "id": container.id}))

async def pull_image(docker, ws, image):
    await ws.send_str(json.dumps({"cmd": "data", "data": "Attempting to pull image %s.\r\n" % (image)}))
    image = await docker.images.pull(image)
    await ws.send_str(json.dumps({"cmd": "image_pull", "image": json.dumps(image)}))
    await ws.send_str(json.dumps({"cmd": "prompt"}))

@routes.get('/main')
async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    try:
        docker = aiodocker.Docker()
        await ws.send_str(json.dumps({"cmd": "data", "data": "Docker connection opened.\r\n"}))
    except Exception as e:
        await ws.send_str(json.dumps({"cmd": "data", "data": "Unable to open Docker connection.\r\n"}))
        return

    await ws.send_str(json.dumps({"cmd": "ready"}))
    
    attached = False
    attached_to = None

    async for msg in ws:
        if msg.type == WSMsgType.TEXT:
            print(msg.data)
            parsed_data = json.loads(msg.data)
            if parsed_data["cmd"] == "attach":
                attached = True
                attached_to = parsed_data["id"]
                break

            if parsed_data["cmd"] == "list":
                await ws.send_str(json.dumps({"cmd": "list", "data": await list_things(docker, ws)}))
                await ws.send_str(json.dumps({"cmd": "prompt"}))
            elif parsed_data["cmd"] == "container":
                await setup_container(docker, ws, parsed_data["data"])
            elif parsed_data["cmd"] == "image":
                await pull_image(docker, ws, parsed_data["image"])
        elif msg.type == WSMsgType.ERROR:
            print('ws connection closed with exception %s' %
                  ws.exception())
    
    if attached:
        container = await docker.containers.get(attached_to)
        
        #container_ws = await container.websocket(stdin=True, stdout=True, stderr=True, stream=True)
        async with container.attach(stdout = True, stderr=True, stdin=True) as container_stream:    
            loop = asyncio.get_event_loop()
            
            async def read():
                stream_data = await container_stream.read_out()
                while stream_data != None:
                    (fno, data) = stream_data
                    await ws.send_str(json.dumps({"cmd": "data_b64", "data": base64.b64encode(data).decode('ascii')}))
                    stream_data = await container_stream.read_out()
                await ws.send_str(json.dumps({"cmd": "data", "data": "\r\nDocker session terminated\r\n"}))

            loop.create_task(read())
            await ws.send_str(json.dumps({"cmd": "attached"}))
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    parsed_msg = json.loads(msg.data)
                    if parsed_msg["cmd"] == "data":
                        await container_stream.write_in(parsed_msg["data"].encode())
                    elif parsed_msg["cmd"] == "data_b64":
                        await container_stream.write_in(base64.b64decode(parsed_msg["data"]))
                    elif "cmd" in parsed_msg:
                        print("WS UNKNOWN DATA TYPE " + parsed_msg["cmd"])
                    else:
                        print("WS MISFORMATTED MSG")
                elif msg.type == WSMsgType.ERROR:
                    print('ws connection closed with exception %s' %
                        ws.exception())
        
    await docker.close()

    print('websocket connection closed')

    return ws

routes.static('/static', rel_path("static/"))

app = web.Application()
aiohttp_jinja2.setup(app, loader=jinja2.FileSystemLoader('templates/')) #TODO
app.add_routes(routes)
web.run_app(app)