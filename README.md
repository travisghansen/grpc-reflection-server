# grpc-reflection-server

`grpc-reflection-server` takes a `descriptor_set.bin` file as input and creates
a full reflection server with the data. This can be used with reverse proxies
where service- or method-based routing is in play and you need a single service
to route all reflection requests to.

# development

```
# build descriptor set
./node_modules/.bin/grpc_tools_node_protoc \
  --descriptor_set_out=descriptor_set.bin \
  --include_imports \
  --proto_path /some/path/packageA \
  --proto_path /some/path/packageB \
  $(find /some/path -name '*.proto')

# start the service
npm run dev

# try it out
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext localhost:50051 describe grpc.health.v1.Health

# test with grpcui
grpcui --plaintext --bind 0.0.0.0 --open-browser=false --port 8080 localhost:50051
```
