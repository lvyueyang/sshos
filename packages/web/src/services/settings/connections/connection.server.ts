/** 连接配置服务：连接 CRUD、连接排序与连接历史。 */

export {
	type ConnectionInput,
	type ConnectionRow,
	createConnection,
	deleteConnection,
	getConnection,
	listConnectionHistory,
	listConnections,
	recordConnectionHistory,
	reorderConnections,
	updateConnection,
} from "./settings.server";
